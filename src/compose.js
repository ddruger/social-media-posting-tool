/**
 * THE COMPOSE ENGINE
 * ==================
 * Takes the one caption you write and mechanically reshapes it into five
 * platform-native drafts. No AI, no API key, fully predictable — this is what
 * runs by default every time you type. The AI rewrite (ai.js) is a separate,
 * on-demand button that replaces one platform's draft.
 */

import { RULES } from './rules.js';
import { len, takeChars, urlsIn, hashtagsIn, xWeightedLength, threadsWeightedLength } from './audit.js';

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

/** Pulls hashtags off the end of a caption and hands back the clean body. */
export function splitTrailingHashtags(text) {
  const lines = (text || '').split('\n');
  const tags = [];
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) { cut = i; continue; }
    const words = line.split(/\s+/);
    if (words.length && words.every((w) => /^#[A-Za-z0-9_]+$/.test(w))) {
      tags.unshift(...words.map((w) => w.slice(1)));
      cut = i;
    } else break;
  }
  let body = lines.slice(0, cut).join('\n').trim();

  // Also sweep up hashtags trailing the final sentence, e.g. "…then type. #adtech #product"
  const tail = body.match(/(?:\s#[A-Za-z0-9_]+)+\s*$/);
  if (tail) {
    tags.unshift(...tail[0].trim().split(/\s+/).map((w) => w.slice(1)));
    body = body.slice(0, tail.index).trim();
  }
  return { body, tags: [...new Set(tags)] };
}

export function stripUrls(text) {
  return (text || '')
    .replace(URL_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    // Removing a link tends to leave a dangling lead-in — "read it here:" or
    // "the breakdown is at" — so tidy those up rather than leaving a stub.
    .split('\n')
    .map((line) => line
      .replace(/[ \t]*(?:\b(?:at|via|here|link)\b[ \t]*)?[:\-–—>→]+[ \t]*$/i, '')
      .replace(/[ \t]*\b(?:is at|are at|read it at|go to|check out)\b[ \t]*$/i, '')
      // A link mid-sentence strands its lead-in: "the breakdown is at — go read it".
      .replace(/[ \t]*\b(?:is|are|lives|sits)?[ \t]*\b(?:at|via)\b[ \t]*(?=[–—-][ \t])/i, ' ')
      .replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sentencesOf(text) {
  return (text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncateAtWord(text, max, suffix = '') {
  if (len(text) <= max) return text;
  const room = max - len(suffix);
  let out = takeChars(text, room);
  const sp = out.lastIndexOf(' ');
  if (sp > room * 0.6) out = out.slice(0, sp);
  return out.replace(/[\s,;:—-]+$/, '') + suffix;
}

/**
 * LinkedIn and Instagram both render as a grey wall unless paragraphs are
 * separated by a blank line. This promotes single newlines to real paragraph
 * breaks and splits any paragraph that is still too long at a sentence edge.
 */
export function reflowParagraphs(text, maxParaChars) {
  const paras = (text || '').split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const para of paras) {
    if (len(para) <= maxParaChars) { out.push(para); continue; }
    let cur = '';
    for (const s of sentencesOf(para)) {
      const next = cur ? `${cur} ${s}` : s;
      if (len(next) > maxParaChars && cur) { out.push(cur); cur = s; } else { cur = next; }
    }
    if (cur) out.push(cur);
  }
  return out.join('\n\n');
}

/** Guarantees a line break after the hook so LinkedIn's fold lands cleanly. */
function breakAfterHook(body, foldChars) {
  if (!body) return body;
  const nl = body.indexOf('\n');
  if (nl !== -1 && nl <= foldChars * 1.4) return body;
  const sents = sentencesOf(body);
  if (sents.length < 2) return body;
  const first = sents[0];
  const rest = body.slice(first.length).trim();
  return `${first}\n\n${rest}`;
}

/** Splits long text into numbered X posts that each fit in 280. */
export function splitThread(text, link = '', platform = 'x') {
  const cap = RULES[platform].maxChars;
  const weigh = platform === 'threads' ? threadsWeightedLength : xWeightedLength;
  const sents = sentencesOf(text);
  const parts = [];
  let cur = '';
  for (const s of sents) {
    const candidate = cur ? `${cur} ${s}` : s;
    // Leave room for the " 1/9" counter.
    if (weigh(candidate) > cap - 6 && cur) {
      parts.push(cur);
      cur = s;
    } else {
      cur = candidate;
    }
  }
  if (cur) parts.push(cur);
  if (link) {
    const last = parts[parts.length - 1] || '';
    if (weigh(`${last}\n\n${link}`) <= cap - 6) parts[parts.length - 1] = `${last}\n\n${link}`;
    else parts.push(link);
  }
  return parts.map((p, i) => (parts.length > 1 ? `${p} ${i + 1}/${parts.length}` : p));
}

/* -------------------------------------------------------------------------- */

function composeLinkedIn(clean, tags, link, mediaKind) {
  const r = RULES.linkedin;
  let body = breakAfterHook(reflowParagraphs(stripUrls(clean), r.maxParagraphChars), r.foldChars);

  // The link stays in the post body on purpose.
  //
  // This used to move it to the first comment automatically. The 2026 data
  // killed that: a body link costs ~18.8% of median reach (van der Blom,
  // 1.3M posts), but LinkedIn now suppresses comments containing links by up
  // to 80% and detects posts built to funnel people into their own comments.
  // The workaround trades a modest, known cost for an unreliable one and
  // hides the link. So we leave it visible and let the audit explain the
  // tradeoff — moving it is one click away if you want it.
  if (link) body = `${body}\n\n${link}`;

  const picked = tags.slice(0, r.hashtags.max);
  if (picked.length) body = `${body}\n\n${picked.map((t) => `#${t}`).join(' ')}`;
  if (len(body) > r.maxChars) body = truncateAtWord(body, r.maxChars, '…');
  return {
    body,
    headline: '',
    first_comment: '',
    hashtags: picked,
    options: { visibility: 'PUBLIC' },
  };
}

function composeX(clean, tags, link, mediaKind, opts = {}) {
  const r = RULES.x;
  const stripped = stripUrls(clean);
  const sents = sentencesOf(stripped);
  const picked = tags.slice(0, r.hashtags.max);
  const suffix = (link ? `\n\n${link}` : '') + (picked.length ? `\n\n${picked.map((t) => `#${t}`).join(' ')}` : '');

  // In thread mode the 280-character ceiling does not apply, so keep the whole
  // argument — trimming it to one post is exactly what threading is for.
  if (opts.xThread) {
    const full = (stripped + suffix).trim();
    return {
      body: full,
      headline: '',
      first_comment: '',
      hashtags: picked,
      options: { x_long_text_as_post: false, thread: true },
      _thread: splitThread(stripped, link),
    };
  }

  // Build up sentence by sentence while it still fits in one post.
  let body = '';
  for (const s of sents) {
    const next = body ? `${body}\n\n${s}` : s;
    if (xWeightedLength(next + suffix) > r.maxChars) break;
    body = next;
  }
  if (!body) body = truncateAtWord(sents[0] || stripped, r.maxChars - xWeightedLength(suffix) - 1, '…');

  return {
    body: (body + suffix).trim(),
    headline: '',
    first_comment: '',
    hashtags: picked,
    options: { x_long_text_as_post: false },
    // Kept so the UI can offer "post the whole thing as a thread" instead.
    _thread: splitThread(stripped, link),
  };
}

function composeThreads(clean, tags, link, mediaKind, opts = {}) {
  const r = RULES.threads;
  const stripped = stripUrls(clean);
  const sents = sentencesOf(stripped);

  // Threads has no hashtags, so the tags never go in the caption. The single
  // best one becomes the topic tag instead, which is the thing that actually
  // classifies the post — and unlike a hashtag it may contain spaces.
  const topic = (tags[0] || '').replace(/[.&]/g, '').slice(0, r.topicTag.maxChars);

  // Links are clickable here and carry no known reach penalty, so unlike
  // LinkedIn there is nothing to weigh up: it stays in the body.
  const suffix = link ? `\n\n${link}` : '';

  const options = {
    // false lets Upload-Post split anything over 500 into a thread rather
    // than rejecting it.
    threads_long_text_as_post: false,
    reply_control: 'everyone',
    ...(topic ? { threads_topic_tag: topic } : {}),
  };

  // Thread mode keeps the whole argument — splitting it is the entire point.
  if (opts.threadsThread) {
    return {
      body: (stripped + suffix).trim(),
      headline: '',
      first_comment: '',
      hashtags: [],
      options: { ...options, thread: true },
      _thread: splitThread(stripped, link, 'threads'),
    };
  }

  // Otherwise build up to the ideal length, not the hard limit — Threads
  // reads fast and a 500-character wall is not what wins here.
  let body = '';
  for (const sent of sents) {
    const next = body ? `${body}\n\n${sent}` : sent;
    if (threadsWeightedLength(next + suffix) > r.idealMax && body) break;
    body = next;
  }
  if (!body) body = truncateAtWord(sents[0] || stripped, r.idealMax, '…');

  let out = (body + suffix).trim();
  if (threadsWeightedLength(out) > r.maxChars) out = truncateAtWord(out, r.maxChars, '…');

  return {
    body: out,
    headline: '',
    first_comment: '',
    hashtags: [],
    options,
    _thread: splitThread(stripped, link, 'threads'),
  };
}

function composeInstagram(clean, tags, link, mediaKind) {
  const r = RULES.instagram;
  let body = reflowParagraphs(stripUrls(clean), 300);
  // A URL is dead text on Instagram, so say where the link actually is.
  if (link) body = `${body}\n\nLink in bio.`;
  const picked = tags.slice(0, r.hashtags.hardMax);
  if (picked.length) body = `${body}\n\n${picked.map((t) => `#${t}`).join(' ')}`;
  if (len(body) > r.maxChars) body = truncateAtWord(body, r.maxChars, '…');
  return {
    body,
    headline: '',
    first_comment: '',
    hashtags: picked,
    options: { media_type: mediaKind === 'video' ? 'REELS' : 'IMAGE', share_to_feed: true },
  };
}

function composeTikTok(clean, tags, link, mediaKind) {
  const r = RULES.tiktok;
  const stripped = stripUrls(clean);
  const sents = sentencesOf(stripped);
  const picked = tags.slice(0, r.hashtags.max);
  const suffix = (link ? '\n\nLink in bio.' : '') + (picked.length ? `\n\n${picked.map((t) => `#${t}`).join(' ')}` : '');

  // TikTok captions earn nothing by being long — build up to the ideal
  // length rather than the hard limit.
  let body = '';
  for (const sent of sents) {
    const next = body ? `${body} ${sent}` : sent;
    if (len(next) > r.idealMax && body) break;
    body = next;
  }
  if (!body) body = truncateAtWord(sents[0] || stripped, r.idealMax, '…');

  // Break after the hook so the opening line stands alone above the fold.
  body = breakAfterHook(body, r.foldChars);

  let out = (body + suffix).trim();
  if (len(out) > r.maxChars) out = truncateAtWord(out, r.maxChars, '…');

  return {
    body: out,
    headline: '',
    first_comment: '',
    hashtags: picked,
    options: {
      privacy_level: 'PUBLIC_TO_EVERYONE',
      post_mode: 'DIRECT_POST',
      disable_comment: false,
      disable_duet: false,
      disable_stitch: false,
      ...(mediaKind === 'image' ? { auto_add_music: true } : {}),
    },
  };
}

function composeYouTube(clean, tags, link, mediaKind) {
  const r = RULES.youtube;
  const stripped = stripUrls(clean);
  const sents = sentencesOf(stripped);

  // Title: the shortest opening sentence that still carries the claim.
  let headline = sents[0] || '';
  if (len(headline) > r.titleIdealMax) {
    const shorter = sents.find((s) => len(s) <= r.titleIdealMax && len(s) > 20);
    headline = shorter || truncateAtWord(headline, r.titleIdealMax);
  }
  headline = headline.replace(/[.]+$/, '');

  let body = stripped;
  if (link) body = `${body}\n\n${link}`;
  const picked = tags.slice(0, r.hashtags.max);
  if (picked.length) body = `${body}\n\n${picked.map((t) => `#${t}`).join(' ')}`;
  if (len(body) > r.maxChars) body = truncateAtWord(body, r.maxChars, '…');

  return {
    body,
    headline: truncateAtWord(headline, r.titleMaxChars),
    first_comment: '',
    hashtags: picked,
    options: { privacyStatus: 'public', selfDeclaredMadeForKids: false, tags: picked },
  };
}

const COMPOSERS = {
  linkedin: composeLinkedIn,
  x: composeX,
  threads: composeThreads,
  instagram: composeInstagram,
  tiktok: composeTikTok,
  youtube: composeYouTube,
};

/**
 * @param {string} master   the single caption you wrote
 * @param {string} linkUrl  optional link for this post
 * @param {string} mediaKind 'video' | 'image' | 'none'
 * @param {string[]} only   limit to these platforms (default: all of them)
 */
export function compose(master, linkUrl = '', mediaKind = 'none', only = null, opts = {}) {
  const { body: clean, tags } = splitTrailingHashtags(master || '');
  // A link typed into the caption counts as the post's link if none was given.
  const link = linkUrl || urlsIn(master || '')[0] || '';
  const inlineTags = hashtagsIn(clean);
  const allTags = [...new Set([...tags, ...inlineTags])];
  const platforms = only || Object.keys(COMPOSERS);

  const out = {};
  for (const p of platforms) {
    if (COMPOSERS[p]) out[p] = COMPOSERS[p](clean, allTags, link, mediaKind, opts);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* One-click fixes                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Applies a fix the audit offered. Returns a partial variant to merge in.
 * Every one of these is something you would otherwise do by hand.
 */
export function applyFix(action, variant, ctx = {}) {
  const body = variant.body || '';
  const opts = (() => {
    if (variant.options && typeof variant.options === 'object') return { ...variant.options };
    try { return JSON.parse(variant.options || '{}'); } catch { return {}; }
  })();

  switch (action) {
    case 'move-link-to-comment': {
      const link = urlsIn(body)[0] || ctx.linkUrl || '';
      if (!link) return {};
      return {
        body: stripUrls(body),
        first_comment: variant.first_comment?.includes(link) ? variant.first_comment : `More here: ${link}`,
      };
    }

    case 'move-link-to-body': {
      const link = urlsIn(variant.first_comment || '')[0] || ctx.linkUrl || '';
      if (!link) return {};
      if ((body || '').includes(link)) return { first_comment: '' };
      return { body: `${body}\n\n${link}`.trim(), first_comment: '' };
    }

    case 'link-in-bio': {
      const cleaned = stripUrls(body);
      return { body: /link in bio/i.test(cleaned) ? cleaned : `${cleaned}\n\nLink in bio.` };
    }

    case 'split-thread':
      // Upload-Post threads long text for us when <platform>_long_text_as_post
      // is false — the flag is named per platform, so pick the right one.
      return variant.platform === 'threads'
        ? { options: { ...opts, threads_long_text_as_post: false, thread: true } }
        : { options: { ...opts, x_long_text_as_post: false, thread: true } };

    case 'tags-to-topic': {
      // Threads has one topic tag, not hashtags. Promote the first tag and
      // strip every # from the caption, since they are plain text there.
      const stored = (() => {
        try { return JSON.parse(variant.hashtags || '[]'); } catch { return []; }
      })();
      const first = (stored[0] || hashtagsIn(body)[0] || '').replace(/^#/, '');
      if (!first) return {};
      const topic = first.replace(/[.&]/g, '').slice(0, RULES.threads.topicTag.maxChars);
      return {
        body: splitTrailingHashtags(body).body,
        hashtags: [],
        options: { ...opts, threads_topic_tag: topic },
      };
    }

    case 'strip-shorts-tag':
      return { headline: (variant.headline || '').replace(/\s*#shorts\b/gi, '').replace(/\s{2,}/g, ' ').trim() };

    case 'trim-to-limit': {
      const cap = ctx.maxChars || RULES[variant.platform]?.maxChars || 280;
      return { body: truncateAtWord(body, cap, '…') };
    }

    default:
      return {};
  }
}
