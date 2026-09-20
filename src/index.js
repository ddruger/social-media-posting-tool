/**
 * SOCIAL STUDIO — Cloudflare Worker
 * =================================
 * Write once → five platform-native drafts → audit against each platform's
 * best practices → schedule everywhere in one click.
 *
 * Scheduled posts are handed to Upload-Post with a `scheduled_date`, so they
 * fire from their servers. Nothing here has to be awake for a post to go out.
 * The cron below only reconciles status so the dashboard stays honest.
 */

import UI from './ui.html';
import SCHEMA from '../migrations/0001_initial.sql';
import MIGRATION_0002 from '../migrations/0002_carousel.sql';
import MIGRATION_0003 from '../migrations/0003_draft_mode.sql';
import MIGRATION_0004 from '../migrations/0004_idea_chat.sql';
import { PLATFORMS, RULES, LAST_REVIEWED, BEST_TIMES } from './rules.js';
import { auditPost, auditVariant } from './audit.js';
import { compose, applyFix } from './compose.js';
import { rewrite, aiKey, riff, buildFromIdea } from './ai.js';
import * as up from './uploadpost.js';
import * as db from './db.js';
import { authed, checkPassword, makeSession, sessionCookie, clearCookie } from './auth.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

const bad = (message, status = 400) => json({ error: message }, status);

const MAX_MEDIA_BYTES = 95 * 1024 * 1024; // Workers cap request bodies around 100MB.

// Bump when you want to confirm a deploy actually landed. Visible at /health.
const VERSION = '2026-09-20.1';

/**
 * Creates the tables if they are missing.
 *
 * Normally the migration runs at deploy time. But if someone deploys without
 * it — easy to do from the Cloudflare dashboard — every page would fail with
 * "no such table" and look thoroughly broken. Every statement in the schema is
 * CREATE ... IF NOT EXISTS, so running it again is harmless.
 */
const sqlStatements = (sql) => sql
  .replace(/--[^\n]*/g, '')
  .split(';')
  .map((line) => line.trim())
  .filter(Boolean);

let schemaChecked = false;
async function ensureSchema(env) {
  if (schemaChecked) return;

  // Base tables: every statement is CREATE ... IF NOT EXISTS, so a batch is safe.
  const base = sqlStatements(SCHEMA).map((line) => env.DB.prepare(line));
  if (base.length) await env.DB.batch(base);

  // Later migrations are ALTER TABLE, which has no IF NOT EXISTS in SQLite.
  // Run them one at a time and ignore the "already there" failure.
  for (const line of [...sqlStatements(MIGRATION_0002), ...sqlStatements(MIGRATION_0003), ...sqlStatements(MIGRATION_0004)]) {
    try {
      await env.DB.prepare(line).run();
    } catch (err) {
      if (!/duplicate column name|already exists/i.test(err?.message || '')) throw err;
    }
  }
  schemaChecked = true;
}

// A missing column matters as much as a missing table: it means a migration
// did not run at deploy time, and the fix for both is to apply the schema.
const isMissingTable = (err) => /no such table|no such column|has no column named/i.test(err?.message || '');

function baseUrl(env, request) {
  const origin = new URL(request.url).origin;
  const configured = (env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return origin;
  // Only honour something that is actually a URL. A setup form that demands a
  // value invites a placeholder, and an unreachable media URL would fail at
  // publish time with an error that points nowhere near the cause.
  try {
    const parsed = new URL(configured);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return configured;
  } catch { /* fall through */ }
  return origin;
}

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                 */
/* -------------------------------------------------------------------------- */

/** Platforms that share a send time go out in one API call. */
function groupBySendTime(variants, scheduledAt) {
  const base = scheduledAt ? new Date(scheduledAt).getTime() : null;
  const groups = new Map();
  for (const v of variants) {
    if (!v.enabled) continue;
    const offset = v.offset_min || 0;
    const key = base === null ? 'now' : new Date(base + offset * 60000).toISOString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  return groups;
}

async function schedulePost(env, request, postId, { force = false } = {}) {
  const post = await db.getPost(env.DB, postId);
  if (!post) return bad('That post no longer exists.', 404);

  const variants = await db.getVariants(env.DB, postId);
  const draftMode = Boolean(post.draft_mode);
  let enabled = variants.filter((v) => v.enabled);
  if (!enabled.length) return bad('No platforms are switched on for this post.');

  // In draft mode only the platforms that can actually receive something
  // unpublished are sent. Publishing the rest live would be the opposite of
  // what was asked for, so they are held back and reported instead.
  let heldBack = [];
  if (draftMode) {
    heldBack = enabled.filter((v) => !RULES[v.platform]?.draft?.supported).map((v) => v.platform);
    enabled = enabled.filter((v) => RULES[v.platform]?.draft?.supported);
    if (!enabled.length) {
      return bad(
        'None of the platforms you picked can accept a draft. '
        + heldBack.map((p) => `${RULES[p]?.label || p}: ${RULES[p]?.draft?.reason}`).join(' ')
        + ' Use Copy caption on each card and post those by hand.',
        409,
      );
    }
  }

  const settings = await db.allSettings(env.DB);
  const items = db.mediaItems(post);
  const result = auditPost(post, variants, settings, items);
  for (const [platform, report] of Object.entries(result.reports)) {
    await db.saveAudit(env.DB, postId, platform, report);
  }
  if (!result.canSchedule && !force) {
    const blocked = Object.values(result.reports).filter((r) => !r.canSchedule);
    return json({
      error: 'The audit found blocking issues.',
      blocked: blocked.map((r) => ({ platform: r.platform, label: r.label, findings: r.findings.filter((f) => f.level === 'blocker') })),
      audit: result,
    }, 409);
  }

  if (post.scheduled_at && new Date(post.scheduled_at).getTime() <= Date.now() + 60_000) {
    return bad('That send time is in the past (or less than a minute away). Pick a later time.');
  }

  const base = baseUrl(env, request);
  const mediaUrls = items.map((i) => `${base}/m/${i.key}`);
  const groups = groupBySendTime(enabled, post.scheduled_at);
  const created = [];
  const failures = [];

  for (const [sendAt, group] of groups) {
    const platforms = group.map((v) => v.platform);
    try {
      const res = await up.publish(env, {
        platforms,
        variants: group,
        mediaKind: post.media_kind,
        mediaUrls,
        sendAt: sendAt === 'now' ? null : sendAt,
        linkUrl: post.link_url,
        timezone: post.timezone,
        draft: draftMode,
      });
      const id = await db.createJob(env.DB, {
        postId, platforms, jobId: res.jobId, requestId: res.requestId,
        sendAt: sendAt === 'now' ? db.nowIso() : sendAt,
        state: res.scheduled ? 'scheduled' : 'pending',
        results: res.results,
      });
      created.push({ id, platforms, jobId: res.jobId, requestId: res.requestId, sendAt, usage: res.usage });
    } catch (err) {
      failures.push({ platforms, error: err.message });
      await db.createJob(env.DB, {
        postId, platforms, sendAt: sendAt === 'now' ? db.nowIso() : sendAt,
        state: 'failed', error: err.message,
      });
    }
  }

  const status = failures.length === 0 ? (post.scheduled_at ? 'scheduled' : (draftMode ? 'drafted' : 'published'))
    : created.length ? 'partial' : 'failed';
  await db.updatePost(env.DB, postId, { status });

  return json({
    ok: failures.length === 0,
    status,
    draftMode,
    jobs: created,
    failures,
    // Named so the UI can say exactly which ones still need posting by hand.
    heldBack: heldBack.map((p) => ({ platform: p, label: RULES[p]?.label || p, reason: RULES[p]?.draft?.reason })),
    audit: result,
  });
}

/** Asks Upload-Post what actually happened to each open job. */
async function reconcile(env) {
  const jobs = await db.openJobs(env.DB);
  const touched = [];
  for (const job of jobs) {
    if (!job.job_id && !job.request_id) continue;
    try {
      const status = await up.getStatus(env, { jobId: job.job_id, requestId: job.request_id });
      const raw = String(status.status || status.state || '').toLowerCase();
      let state = job.state;
      if (['completed', 'success', 'published', 'done'].includes(raw)) state = 'published';
      else if (['failed', 'error'].includes(raw)) state = 'failed';
      else if (['scheduled', 'pending', 'processing', 'queued'].includes(raw)) state = raw === 'scheduled' ? 'scheduled' : 'pending';

      if (state !== job.state || status.results) {
        await db.updateJob(env.DB, job.id, {
          state,
          results: status.results || JSON.parse(job.results || '{}'),
          error: status.error || job.error || '',
        });
        touched.push({ job: job.id, state });
      }
    } catch (err) {
      // A transient API error must not mark a real post as failed.
      touched.push({ job: job.id, error: err.message });
    }
  }

  // Roll job states up to their posts.
  const settings = await db.allSettings(env.DB);
  const postIds = [...new Set(jobs.map((j) => j.post_id))];
  for (const pid of postIds) {
    const all = await db.getJobs(env.DB, pid);
    const states = all.map((j) => j.state);
    let status = null;
    if (states.length && states.every((s) => s === 'published')) status = 'published';
    else if (states.includes('failed') && states.some((s) => s === 'published')) status = 'partial';
    else if (states.length && states.every((s) => s === 'failed')) status = 'failed';
    if (status) await db.updatePost(env.DB, pid, { status });
    // Only a genuinely published post is finished with its files. A draft
    // still needs them when you go in to tag and publish.
    const p = await db.getPost(env.DB, pid);
    if (status === 'published' && !p?.draft_mode) await purgeMedia(env, pid, settings);
  }
  return touched;
}

/**
 * Once every platform has the video, our copy is dead weight — and R2's free
 * tier is 10GB, which a weekly posting habit would eventually walk into. So
 * the file is deleted after a fully successful publish. The post keeps its
 * dimensions and duration so the record still reads sensibly.
 *
 * Turn it off in Settings if you'd rather keep the originals here.
 */
async function purgeMedia(env, postId, settings) {
  if (settings?.keepMediaAfterPublish) return;
  const post = await db.getPost(env.DB, postId);
  const items = db.mediaItems(post);
  if (!items.length) return;
  for (const item of items) await env.MEDIA.delete(item.key).catch(() => {});
  let meta = {};
  try { meta = JSON.parse(post.media_meta || '{}'); } catch { /* keep going */ }
  await db.updatePost(env.DB, postId, {
    media_key: null,
    media_items: JSON.stringify(items.map((i) => ({ ...i, key: null }))),
    media_meta: JSON.stringify({ ...meta, purged: true, purgedAt: db.nowIso(), count: items.length }),
  });
}

/* -------------------------------------------------------------------------- */
/* Request handling                                                           */
/* -------------------------------------------------------------------------- */

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;
  const body = ['POST', 'PATCH', 'PUT'].includes(method) && request.headers.get('content-type')?.includes('json')
    ? await request.json().catch(() => ({}))
    : {};

  /* ---- auth ---- */
  if (path === '/login' && method === 'POST') {
    if (!checkPassword(env, body.password)) return bad('Wrong password.', 401);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession(env)) });
  }
  if (path === '/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  }

  if (!(await authed(request, env))) return bad('Not signed in.', 401);

  /* ---- reference data ---- */
  if (path === '/state' && method === 'GET') {
    const [posts, settings] = await Promise.all([db.listPosts(env.DB), db.allSettings(env.DB)]);
    return json({
      posts, settings, platforms: PLATFORMS, rules: RULES, bestTimes: BEST_TIMES,
      rulesReviewed: LAST_REVIEWED,
      defaultTimezone: env.DEFAULT_TIMEZONE || 'America/Los_Angeles',
      defaultPlatforms: settings.defaultPlatforms || db.DEFAULT_ENABLED_PLATFORMS,
      hasAi: Boolean(aiKey(env)),
      profile: env.UPLOADPOST_USER || null,
    });
  }

  if (path === '/account' && method === 'GET') {
    try {
      const [me, profiles] = await Promise.all([
        up.getAccount(env).catch((e) => ({ error: e.message })),
        up.listProfiles(env).catch((e) => ({ error: e.message })),
      ]);
      return json({ me, profiles });
    } catch (err) {
      return bad(err.message, 502);
    }
  }

  if (path === '/connect' && method === 'POST') {
    const username = env.UPLOADPOST_USER;
    if (!username) return bad('UPLOADPOST_USER is not set. See the README.');
    try {
      await up.ensureProfile(env, username);
      const res = await up.connectUrl(env, { username, redirectUrl: baseUrl(env, request) });
      return json({ url: res.access_url || res.url || res.jwt_url || null, raw: res });
    } catch (err) {
      return bad(err.message, 502);
    }
  }

  if (path === '/settings' && method === 'POST') {
    for (const [k, v] of Object.entries(body || {})) await db.setSetting(env.DB, k, v);
    return json({ ok: true, settings: await db.allSettings(env.DB) });
  }

  /* ---- live compose + audit (nothing saved) ---- */
  if (path === '/compose' && method === 'POST') {
    return json({ variants: compose(body.master || '', body.link_url || '', body.media_kind || 'none', body.only || null, body.opts || {}) });
  }

  if (path === '/audit' && method === 'POST') {
    const settings = await db.allSettings(env.DB);
    const variants = (body.variants || []).filter((v) => v.enabled !== false);
    const reports = {};
    for (const v of variants) {
      reports[v.platform] = auditVariant(v, {
        media: body.media_meta || {}, mediaKind: body.media_kind || 'none',
        hasMedia: body.has_media !== false,
        items: body.items || [],
        siblings: variants, scheduledAt: body.scheduled_at, timezone: body.timezone,
        settings: { ...settings, ...(body.settings || {}) },
      });
    }
    const all = Object.values(reports);
    return json({
      reports,
      overall: all.length ? Math.round(all.reduce((s, r) => s + r.score, 0) / all.length) : 0,
      canSchedule: all.length > 0 && all.every((r) => r.canSchedule),
    });
  }

  if (path === '/fix' && method === 'POST') {
    return json({ patch: applyFix(body.action, body.variant || {}, body.ctx || {}) });
  }

  if (path === '/idea' && method === 'POST') {
    try {
      const settings = await db.allSettings(env.DB);
      const out = await riff(env, { messages: body.messages || [], settings });
      if (body.post_id) {
        const msgs = [...(body.messages || []), { role: 'assistant', content: out.content }];
        await db.updatePost(env.DB, body.post_id, { idea_chat: JSON.stringify(msgs) });
      }
      return json(out);
    } catch (err) {
      return bad(err.message, err.status || 502);
    }
  }

  if (path === '/idea/build' && method === 'POST') {
    try {
      const settings = await db.allSettings(env.DB);
      const out = await buildFromIdea(env, { messages: body.messages || [], settings });
      if (!out.caption) return bad('The idea builder returned nothing to work with. Try one more exchange first.', 502);
      return json(out);
    } catch (err) {
      return bad(err.message, err.status || 502);
    }
  }

  if (path === '/rewrite' && method === 'POST') {
    try {
      const settings = await db.allSettings(env.DB);
      const out = await rewrite(env, {
        platform: body.platform, master: body.master, current: body.current,
        linkUrl: body.link_url, mediaKind: body.media_kind,
        settings, instruction: body.instruction,
      });
      return json(out);
    } catch (err) {
      return bad(err.message, err.status || 502);
    }
  }

  /* ---- posts ---- */
  if (path === '/posts' && method === 'POST') {
    const composed = compose(body.master_caption || '', body.link_url || '', body.media_kind || 'none');
    const id = await db.createPost(env.DB, { ...body, timezone: body.timezone || env.DEFAULT_TIMEZONE });
    const settings = await db.allSettings(env.DB);
    await db.seedVariants(env.DB, id, composed, settings.defaultPlatforms);
    return json({ id, post: await db.getPost(env.DB, id), variants: await db.getVariants(env.DB, id) });
  }

  const postMatch = path.match(/^\/posts\/([\w-]+)(\/[\w-]+)?$/);
  if (postMatch) {
    const id = postMatch[1];
    const action = (postMatch[2] || '').slice(1);
    const post = await db.getPost(env.DB, id);
    if (!post) return bad('Post not found.', 404);

    if (!action && method === 'GET') {
      return json({
        post,
        variants: await db.getVariants(env.DB, id),
        audits: await db.getAudits(env.DB, id),
        jobs: await db.getJobs(env.DB, id),
      });
    }

    if (!action && method === 'PATCH') {
      const patch = { ...(body.post || {}) };
      // Clearing the send time on a post that never went out returns it to a
      // draft, so the list reflects what is actually parked.
      if ('scheduled_at' in patch && !patch.scheduled_at && ['draft', 'scheduled'].includes(post.status)) {
        patch.status = 'draft';
      }
      await db.updatePost(env.DB, id, patch);
      for (const v of body.variants || []) await db.upsertVariant(env.DB, id, v.platform, v);
      return json({ post: await db.getPost(env.DB, id), variants: await db.getVariants(env.DB, id) });
    }

    if (!action && method === 'DELETE') {
      // Pull the scheduled jobs back before deleting, or they fire anyway.
      for (const job of await db.getJobs(env.DB, id)) {
        if (job.job_id && ['scheduled', 'pending'].includes(job.state)) {
          await up.cancelScheduled(env, job.job_id).catch(() => {});
        }
      }
      await env.DB.batch([
        env.DB.prepare('DELETE FROM variants WHERE post_id = ?').bind(id),
        env.DB.prepare('DELETE FROM audits   WHERE post_id = ?').bind(id),
        env.DB.prepare('DELETE FROM jobs     WHERE post_id = ?').bind(id),
        env.DB.prepare('DELETE FROM posts    WHERE id = ?').bind(id),
      ]);
      for (const item of db.mediaItems(post)) {
        if (item.key) await env.MEDIA.delete(item.key).catch(() => {});
      }
      return json({ ok: true });
    }

    if (action === 'recompose' && method === 'POST') {
      const composed = compose(post.master_caption, post.link_url, post.media_kind, body.only || null);
      const existing = await db.getVariants(env.DB, id);
      for (const [platform, c] of Object.entries(composed)) {
        const prev = existing.find((v) => v.platform === platform);
        await db.upsertVariant(env.DB, id, platform, { ...c, enabled: prev ? prev.enabled : true, offset_min: prev?.offset_min || 0 });
      }
      return json({ variants: await db.getVariants(env.DB, id) });
    }

    if (action === 'audit' && method === 'POST') {
      const variants = await db.getVariants(env.DB, id);
      const settings = await db.allSettings(env.DB);
      const result = auditPost(post, variants, settings, db.mediaItems(post));
      for (const [platform, report] of Object.entries(result.reports)) {
        await db.saveAudit(env.DB, id, platform, report);
      }
      return json(result);
    }

    if (action === 'schedule' && method === 'POST') {
      return schedulePost(env, request, id, { force: Boolean(body.force) });
    }

    if (action === 'cancel' && method === 'POST') {
      const jobs = await db.getJobs(env.DB, id);
      const errors = [];
      for (const job of jobs) {
        if (!job.job_id || !['scheduled', 'pending'].includes(job.state)) continue;
        try {
          await up.cancelScheduled(env, job.job_id);
          await db.updateJob(env.DB, job.id, { state: 'cancelled' });
        } catch (err) {
          errors.push(`${JSON.parse(job.platforms || '[]').join(', ')}: ${err.message}`);
        }
      }
      await db.updatePost(env.DB, id, { status: errors.length ? 'partial' : 'draft' });
      return json({ ok: !errors.length, errors });
    }
  }

  /* ---- media ---- */
  if (path === '/media' && method === 'POST') {
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_MEDIA_BYTES) {
      return bad(`That file is ${(len / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_MEDIA_BYTES / 1024 / 1024} MB — export it smaller and try again.`, 413);
    }
    const name = request.headers.get('x-filename') || 'upload';
    const type = request.headers.get('content-type') || 'application/octet-stream';
    const ext = (name.match(/\.[A-Za-z0-9]{1,5}$/) || [''])[0].toLowerCase();
    // The key is unguessable because this path has to stay public for
    // Upload-Post to fetch the file.
    const key = `${crypto.randomUUID()}${ext}`;
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
    return json({ key, url: `${baseUrl(env, request)}/m/${key}`, name, type });
  }

  if (path === '/refresh' && method === 'POST') {
    return json({ updated: await reconcile(env) });
  }

  return bad('Unknown endpoint.', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // Public media. Upload-Post fetches these by URL, so no auth here —
      // security comes from the key being a random UUID.
      if (url.pathname.startsWith('/m/')) {
        const key = decodeURIComponent(url.pathname.slice(3));
        const obj = await env.MEDIA.get(key);
        if (!obj) return new Response('Not found', { status: 404 });
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('cache-control', 'public, max-age=86400');
        headers.set('accept-ranges', 'bytes');
        return new Response(obj.body, { headers });
      }

      if (url.pathname.startsWith('/api/')) {
        // Media uploads stream a large body, so they must not be cloned.
        // They also never touch the database, so they never need the retry.
        const retry = url.pathname === '/api/media' ? null : request.clone();
        try {
          return await handleApi(request, env, url);
        } catch (err) {
          if (!retry || !isMissingTable(err)) throw err;
          await ensureSchema(env);
          return await handleApi(retry, env, url);
        }
      }

      // Public, and deliberately says nothing about configuration. `version`
      // is here so you can tell which build is actually live after a push.
      if (url.pathname === '/health') {
        return json({ ok: true, version: VERSION, rulesReviewed: LAST_REVIEWED });
      }

      return new Response(UI, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    } catch (err) {
      return json({ error: err.message || 'Something went wrong.' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      reconcile(env).catch(async (err) => {
        if (!isMissingTable(err)) return;
        await ensureSchema(env).catch(() => {});
      }),
    );
  },
};
