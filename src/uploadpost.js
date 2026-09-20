/**
 * UPLOAD-POST CLIENT
 * ==================
 * One API key, one call, five platforms. Upload-Post holds the schedule on
 * their own servers, so a post fires at its scheduled time whether or not this
 * Worker (or your laptop) is awake.
 *
 * Endpoints and parameter names verified against
 * https://docs.upload-post.com/openapi.json on 2026-09-19.
 */

const DEFAULT_BASE = 'https://api.upload-post.com/api';

// Overridable so the publish/reconcile flow can be tested against a mock
// instead of posting to real accounts. Leave it unset in normal use.
const baseOf = (env) => (env.UPLOADPOST_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');

export class UploadPostError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'UploadPostError';
    this.status = status;
    this.body = body;
  }
}

function authHeaders(env) {
  if (!env.UPLOADPOST_API_KEY) {
    throw new UploadPostError('UPLOADPOST_API_KEY is not set. Run: npx wrangler secret put UPLOADPOST_API_KEY', 500);
  }
  return { Authorization: `Apikey ${env.UPLOADPOST_API_KEY}` };
}

async function call(env, path, { method = 'GET', form, query } = {}) {
  const url = new URL(baseOf(env) + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { method, headers: authHeaders(env), body: form });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.message || body?.error || body?.detail || `Upload-Post returned ${res.status}`;
    throw new UploadPostError(msg, res.status, body);
  }
  return body;
}

/* -------------------------------------------------------------------------- */
/* Account + connection                                                       */
/* -------------------------------------------------------------------------- */

export const getAccount = (env) => call(env, '/uploadposts/me');
export const listProfiles = (env) => call(env, '/uploadposts/users');

/** Builds the hosted page where you click "connect" for each platform. */
export async function connectUrl(env, { username, redirectUrl, platforms }) {
  const form = new FormData();
  form.set('username', username);
  if (redirectUrl) form.set('redirect_url', redirectUrl);
  form.set('connect_title', 'Connect your accounts to Social Studio');
  form.set('connect_description', 'Link LinkedIn, X, Instagram and YouTube once. Social Studio posts to them on your schedule.');
  for (const p of platforms || ['linkedin', 'x', 'instagram', 'youtube']) form.append('platforms', p);
  return call(env, '/uploadposts/users/generate-jwt', { method: 'POST', form });
}

export async function ensureProfile(env, username) {
  const existing = await listProfiles(env).catch(() => null);
  const names = (existing?.profiles || existing?.users || existing?.data || [])
    .map((p) => p.username || p.name || p);
  if (names.includes(username)) return { created: false };
  const form = new FormData();
  form.set('username', username);
  await call(env, '/uploadposts/users', { method: 'POST', form });
  return { created: true };
}

/* -------------------------------------------------------------------------- */
/* Publishing                                                                 */
/* -------------------------------------------------------------------------- */

const jsonOf = (v) => {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v || '{}'); } catch { return {}; }
};

/**
 * Maps our per-platform variants onto Upload-Post's parameter names.
 * Everything here is a platform-specific override, which is exactly how we
 * get five different captions out of a single API call.
 */
function applyVariant(form, variant, mediaKind, draft = false) {
  const body = variant.body || '';
  const opts = jsonOf(variant.options);

  switch (variant.platform) {
    case 'linkedin':
      // For media posts the commentary field is linkedin_description; for
      // text-only posts it is linkedin_title. We set both — the unused one
      // is ignored by the endpoint that does not accept it.
      form.set('linkedin_description', body);
      form.set('linkedin_title', body);
      form.set('visibility', opts.visibility || 'PUBLIC');
      if (opts.linkedin_visibility) form.set('linkedin_visibility', opts.linkedin_visibility);
      if (opts.target_linkedin_page_id) form.set('target_linkedin_page_id', opts.target_linkedin_page_id);
      if (variant.first_comment) form.set('linkedin_first_comment', variant.first_comment);
      break;

    case 'x':
      form.set('x_title', body);
      // false => Upload-Post splits long text into a thread for us.
      form.set('x_long_text_as_post', String(opts.x_long_text_as_post ?? false));
      if (opts.reply_settings) form.set('reply_settings', opts.reply_settings);
      if (variant.first_comment) form.set('x_first_comment', variant.first_comment);
      break;

    case 'instagram':
      form.set('instagram_title', body);
      if (mediaKind === 'video') {
        form.set('media_type', opts.media_type || 'REELS');
        form.set('share_to_feed', String(opts.share_to_feed ?? true));
        if (opts.cover_url) form.set('cover_url', opts.cover_url);
      } else if (mediaKind === 'image') {
        form.set('media_type', opts.media_type || 'IMAGE');
      }
      if (opts.collaborators) form.set('collaborators', opts.collaborators);
      if (variant.first_comment) form.set('instagram_first_comment', variant.first_comment);
      break;

    case 'tiktok':
      form.set('tiktok_title', body);
      // TikTok requires privacy explicitly; DIRECT_POST publishes, while
      // MEDIA_UPLOAD drops it into your TikTok drafts instead.
      form.set('privacy_level', opts.privacy_level || 'PUBLIC_TO_EVERYONE');
      // MEDIA_UPLOAD drops it into your TikTok drafts instead of publishing.
      form.set('post_mode', draft ? 'MEDIA_UPLOAD' : (opts.post_mode || 'DIRECT_POST'));
      form.set('disable_comment', String(opts.disable_comment ?? false));
      form.set('disable_duet', String(opts.disable_duet ?? false));
      form.set('disable_stitch', String(opts.disable_stitch ?? false));
      // Required disclosures — only sent when actually true.
      if (opts.brand_content_toggle) form.set('brand_content_toggle', 'true');
      if (opts.brand_organic_toggle) form.set('brand_organic_toggle', 'true');
      if (opts.is_aigc) form.set('is_aigc', 'true');
      if (opts.cover_timestamp) form.set('cover_timestamp', String(opts.cover_timestamp));
      if (mediaKind === 'image') {
        form.set('tiktok_description', body);
        form.set('auto_add_music', String(opts.auto_add_music ?? true));
        if (opts.photo_cover_index !== undefined) form.set('photo_cover_index', String(opts.photo_cover_index));
      }
      break;

    case 'youtube':
      form.set('youtube_title', variant.headline || body.slice(0, 100));
      form.set('youtube_description', body);
      // YouTube has no draft; unlisted is the working equivalent.
      form.set('privacyStatus', draft ? 'unlisted' : (opts.privacyStatus || 'public'));
      form.set('selfDeclaredMadeForKids', String(opts.selfDeclaredMadeForKids ?? false));
      for (const t of opts.tags || []) form.append('tags', t);
      if (opts.thumbnail_url) form.set('thumbnail_url', opts.thumbnail_url);
      if (variant.first_comment) form.set('youtube_first_comment', variant.first_comment);
      break;
  }
}

/**
 * Publishes (or schedules) one group of platforms that share a send time.
 *
 * @param {object} args
 *   platforms   string[]  e.g. ['linkedin','x']
 *   variants    object[]  the matching variant rows
 *   mediaKind   'video' | 'image' | 'none'
 *   mediaUrl    public URL of the video/image (required for video/image)
 *   sendAt      ISO-8601 UTC string, or null to publish immediately
 *   linkUrl     optional link, used for text-post link previews
 */
export async function publish(env, args) {
  const { platforms, variants, mediaKind, mediaUrls = [], sendAt, linkUrl, timezone } = args;
  const user = env.UPLOADPOST_USER;
  if (!user) throw new UploadPostError('UPLOADPOST_USER is not set.', 500);
  if (!platforms?.length) throw new UploadPostError('No platforms selected.', 400);

  const form = new FormData();
  form.set('user', user);
  for (const p of platforms) form.append('platform[]', p);

  // A sensible default that every platform-specific override supersedes.
  const primary = variants.find((v) => v.platform === platforms[0]) || variants[0];
  form.set('title', primary?.headline || primary?.body || '');

  for (const v of variants) {
    if (platforms.includes(v.platform)) applyVariant(form, v, mediaKind, Boolean(args.draft));
  }

  if (sendAt) {
    form.set('scheduled_date', sendAt);
    if (timezone) form.set('timezone', timezone);
  } else {
    // Long uploads would otherwise block past the Worker's request budget.
    form.set('async_upload', 'true');
  }

  // One video goes to /upload; anything else with media — a single image or a
  // carousel, including Instagram's mixed image/video kind — goes to
  // /upload_photos, which takes an ordered photos[] list.
  let path;
  if (mediaUrls.length > 1) {
    for (const u of mediaUrls) form.append('photos[]', u);
    path = '/upload_photos';
  } else if (mediaKind === 'video') {
    if (!mediaUrls[0]) throw new UploadPostError('A video was selected but it has no public URL yet.', 400);
    form.set('video', mediaUrls[0]);
    path = '/upload';
  } else if (mediaKind === 'image') {
    if (!mediaUrls[0]) throw new UploadPostError('An image was selected but it has no public URL yet.', 400);
    form.append('photos[]', mediaUrls[0]);
    path = '/upload_photos';
  } else {
    if (linkUrl) form.set('link_url', linkUrl);
    path = '/upload_text';
  }

  const body = await call(env, path, { method: 'POST', form });
  return {
    jobId: body.job_id || null,
    requestId: body.request_id || null,
    scheduled: Boolean(body.job_id),
    results: body.results || {},
    usage: body.usage || null,
    raw: body,
  };
}

/* -------------------------------------------------------------------------- */
/* Status + schedule management                                               */
/* -------------------------------------------------------------------------- */

export const getStatus = (env, { jobId, requestId }) =>
  call(env, '/uploadposts/status', { query: { job_id: jobId, request_id: requestId } });

export const listScheduled = (env) => call(env, '/uploadposts/schedule');

export const cancelScheduled = (env, jobId) =>
  call(env, `/uploadposts/schedule/${encodeURIComponent(jobId)}`, { method: 'DELETE' });

export async function rescheduleJob(env, jobId, { scheduledDate, title, caption }) {
  const form = new FormData();
  if (scheduledDate) form.set('scheduled_date', scheduledDate);
  if (title) form.set('title', title);
  if (caption) form.set('caption', caption);
  return call(env, `/uploadposts/schedule/${encodeURIComponent(jobId)}`, { method: 'PATCH', form });
}

export const postAnalytics = (env, requestId) =>
  call(env, `/uploadposts/post-analytics/${encodeURIComponent(requestId)}`);

export const profileAnalytics = (env, username, platforms) =>
  call(env, `/analytics/${encodeURIComponent(username)}`, { query: { platforms: (platforms || []).join(',') } });
