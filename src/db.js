/** Thin helpers over D1. Nothing clever — just keeps index.js readable. */

import { PLATFORMS } from './rules.js';

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export async function listPosts(db, { status, limit = 100 } = {}) {
  const sql = status
    ? 'SELECT * FROM posts WHERE status = ? ORDER BY COALESCE(scheduled_at, updated_at) DESC LIMIT ?'
    : 'SELECT * FROM posts ORDER BY COALESCE(scheduled_at, updated_at) DESC LIMIT ?';
  const args = status ? [status, limit] : [limit];
  const { results } = await db.prepare(sql).bind(...args).all();
  return results || [];
}

export async function getPost(db, id) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
}

export async function getVariants(db, postId) {
  const { results } = await db.prepare('SELECT * FROM variants WHERE post_id = ?').bind(postId).all();
  return results || [];
}

export async function getAudits(db, postId) {
  const { results } = await db.prepare('SELECT * FROM audits WHERE post_id = ?').bind(postId).all();
  const out = {};
  for (const r of results || []) {
    try { out[r.platform] = JSON.parse(r.report); } catch { /* ignore a corrupt row */ }
  }
  return out;
}

export async function getJobs(db, postId) {
  const { results } = await db.prepare('SELECT * FROM jobs WHERE post_id = ? ORDER BY created_at').bind(postId).all();
  return results || [];
}

/**
 * Reads a post's media as an ordered list, whichever way it was stored.
 * Older posts kept a single file in media_key, so that becomes item one.
 */
export function mediaItems(post) {
  if (!post) return [];
  let items = [];
  try { items = JSON.parse(post.media_items || '[]'); } catch { items = []; }
  if (items.length) return items;
  if (post.media_key) {
    let meta = {};
    try { meta = JSON.parse(post.media_meta || '{}'); } catch { /* ignore */ }
    return [{ key: post.media_key, kind: post.media_kind || 'image', meta }];
  }
  return [];
}

export async function createPost(db, data) {
  const id = newId();
  const ts = nowIso();
  await db.prepare(
    `INSERT INTO posts (id, name, master_caption, link_url, media_key, media_kind, media_meta,
                        media_items, status, scheduled_at, timezone, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, data.name || '', data.master_caption || '', data.link_url || '',
    data.media_key || null, data.media_kind || 'none', JSON.stringify(data.media_meta || {}),
    JSON.stringify(data.media_items || []),
    'draft', data.scheduled_at || null, data.timezone || 'America/Los_Angeles', ts, ts,
  ).run();
  return id;
}

const POST_FIELDS = ['name', 'master_caption', 'link_url', 'media_key', 'media_kind', 'media_meta', 'media_items', 'status', 'scheduled_at', 'timezone', 'draft_mode', 'idea_chat'];

export async function updatePost(db, id, patch) {
  const sets = [];
  const args = [];
  for (const f of POST_FIELDS) {
    if (!(f in patch)) continue;
    sets.push(`${f} = ?`);
    const isJsonField = f === 'media_meta' || f === 'media_items';
    args.push(isJsonField && typeof patch[f] !== 'string' ? JSON.stringify(patch[f]) : patch[f]);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  args.push(nowIso(), id);
  await db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
}

export async function upsertVariant(db, postId, platform, v) {
  await db.prepare(
    `INSERT INTO variants (post_id, platform, enabled, body, headline, first_comment, hashtags, options, offset_min, media_items)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(post_id, platform) DO UPDATE SET
       enabled=excluded.enabled, body=excluded.body, headline=excluded.headline,
       first_comment=excluded.first_comment, hashtags=excluded.hashtags,
       options=excluded.options, offset_min=excluded.offset_min,
       media_items=excluded.media_items`,
  ).bind(
    postId, platform, v.enabled ? 1 : 0, v.body || '', v.headline || '', v.first_comment || '',
    typeof v.hashtags === 'string' ? v.hashtags : JSON.stringify(v.hashtags || []),
    typeof v.options === 'string' ? v.options : JSON.stringify(v.options || {}),
    v.offset_min || 0,
    typeof v.media_items === 'string' ? v.media_items : JSON.stringify(v.media_items || []),
  ).run();
}

/**
 * The media a given platform will actually publish.
 *
 * A variant with its own list overrides the post's; an empty list inherits.
 * Inheriting is the default so the common case — one video everywhere — needs
 * no per-platform fiddling at all.
 */
export function variantMedia(post, variant) {
  let own = [];
  try { own = JSON.parse(variant?.media_items || '[]'); } catch { own = []; }
  return own.length ? { items: own, own: true } : { items: mediaItems(post), own: false };
}

/** What kind of post this media makes: a lone video, images, or neither. */
export function mediaKindOf(items) {
  if (!items.length) return 'none';
  if (items.length === 1) return items[0].kind || 'image';
  return 'image';
}

export async function saveAudit(db, postId, platform, report) {
  await db.prepare(
    `INSERT INTO audits (post_id, platform, score, blockers, report, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(post_id, platform) DO UPDATE SET
       score=excluded.score, blockers=excluded.blockers, report=excluded.report, created_at=excluded.created_at`,
  ).bind(postId, platform, report.score, report.counts.blocker, JSON.stringify(report), nowIso()).run();
}

export async function createJob(db, { postId, platforms, jobId, requestId, sendAt, state, results, error }) {
  const id = newId();
  const ts = nowIso();
  await db.prepare(
    `INSERT INTO jobs (id, post_id, platforms, job_id, request_id, send_at, state, results, error, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, postId, JSON.stringify(platforms || []), jobId || null, requestId || null,
    sendAt || null, state || 'pending', JSON.stringify(results || {}), error || '', ts, ts,
  ).run();
  return id;
}

export async function updateJob(db, id, patch) {
  const sets = [];
  const args = [];
  for (const f of ['job_id', 'request_id', 'state', 'error', 'send_at']) {
    if (f in patch) { sets.push(`${f} = ?`); args.push(patch[f]); }
  }
  if ('results' in patch) { sets.push('results = ?'); args.push(JSON.stringify(patch.results)); }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  args.push(nowIso(), id);
  await db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
}

export async function openJobs(db) {
  const { results } = await db.prepare(
    "SELECT * FROM jobs WHERE state IN ('pending','scheduled') ORDER BY created_at LIMIT 100",
  ).all();
  return results || [];
}

export async function getSetting(db, key, fallback = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export async function setSetting(db, key, value) {
  await db.prepare(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).bind(key, JSON.stringify(value)).run();
}

export async function allSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of results || []) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

/**
 * Creates one variant row per platform for a brand-new post.
 * `enabledPlatforms` decides which start switched on; anything omitted is
 * created but off, so it is one click away rather than missing.
 */
export const DEFAULT_ENABLED_PLATFORMS = ['linkedin', 'x', 'instagram', 'youtube'];

export async function seedVariants(db, postId, composed, enabledPlatforms) {
  const on = new Set(enabledPlatforms?.length ? enabledPlatforms : DEFAULT_ENABLED_PLATFORMS);
  for (const p of PLATFORMS) {
    const c = composed[p] || {};
    await upsertVariant(db, postId, p, {
      enabled: on.has(p), body: c.body || '', headline: c.headline || '',
      first_comment: c.first_comment || '', hashtags: c.hashtags || [],
      options: c.options || {}, offset_min: 0,
    });
  }
}
