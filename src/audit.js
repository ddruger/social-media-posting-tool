/**
 * THE AUDIT ENGINE
 * ================
 * Runs a post through every best-practice check for a platform and returns a
 * score plus a list of findings. Findings come in four levels:
 *
 *   blocker — will be rejected or will clearly flop. Scheduling is held.
 *   warn    — allowed, but you're leaving reach on the table.
 *   tip     — a judgement call worth a look.
 *   pass    — checked and fine. Shown so you can see what was verified.
 *
 * Some findings carry a `fix`, which the UI turns into a one-click button.
 */

import { RULES, BAIT_PHRASES, AI_TELLS, CORPORATE_SPEAK, BEST_TIMES, PLATFORM_LABELS } from './rules.js';

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const HASHTAG_RE = /(^|\s)#([A-Za-z0-9_]{1,60})/g;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
// Flags are pairs of regional indicators, which are not Extended_Pictographic,
// so they need matching separately or X under-counts them.
const WIDE_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const CJK_RE = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏]/u;

/**
 * Counts what a reader sees, not what JavaScript stores.
 *
 * A flag, a family, or any emoji carrying a skin tone is several code points
 * glued together — 👨‍👩‍👧 is five. Counting those individually made the audit
 * claim a caption was longer than it is, eating into the budget for nothing.
 * Grapheme clusters are what the platforms count and what a person sees.
 */
const graphemes = (() => {
  try {
    const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return (s) => [...seg.segment(s)].map((g) => g.segment);
  } catch {
    return (s) => [...s]; // Very old runtime: code points are the best we have.
  }
})();

export const len = (s) => graphemes(s || '').length;

/** The visible text, cut at n characters as a reader would count them. */
export const takeChars = (s, n) => graphemes(s || '').slice(0, n).join('');
export const urlsIn = (s) => (s || '').match(URL_RE) || [];
export const emojiCount = (s) => ((s || '').match(EMOJI_RE) || []).length;

export function hashtagsIn(s) {
  const out = [];
  let m;
  HASHTAG_RE.lastIndex = 0;
  while ((m = HASHTAG_RE.exec(s || '')) !== null) out.push(m[2]);
  return out;
}

/** X bills every link at a flat 23 chars and double-counts emoji/CJK. */
export function xWeightedLength(text, urlCost = 23) {
  let body = text || '';
  const urls = urlsIn(body);
  for (const u of urls) body = body.replace(u, '');
  let count = 0;
  // Weigh whole emoji, not their pieces: X bills one emoji as two, however
  // many code points it is built from.
  for (const g of graphemes(body)) {
    count += WIDE_RE.test(g) || CJK_RE.test(g) ? 2 : 1;
  }
  return count + urls.length * urlCost;
}

export function firstLineOf(text) {
  const t = (text || '').trim();
  const nl = t.indexOf('\n');
  return nl === -1 ? t : t.slice(0, nl);
}

/** Text as the reader sees it before the "see more" fold. */
function beforeFold(text, n) {
  return takeChars(text, n);
}

function paragraphsOf(text) {
  return (text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function containsAny(text, phrases) {
  const low = (text || '').toLowerCase();
  return phrases.filter((p) => low.includes(p.toLowerCase()));
}

/**
 * A tag can appear both inline in the caption and in the hashtags field.
 * Count the union, case-insensitively, so it is never double-counted.
 */
function safeJson(v) {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v || '{}'); } catch { return {}; }
}

function collectTags(variant, text) {
  const stored = (() => { try { return JSON.parse(variant.hashtags || '[]'); } catch { return []; } })();
  const seen = new Map();
  for (const t of [...hashtagsIn(text), ...stored]) {
    const key = String(t).replace(/^#/, '').toLowerCase();
    if (key && !seen.has(key)) seen.set(key, String(t).replace(/^#/, ''));
  }
  return [...seen.values()];
}

/** "a", "a and b", "a, b and c" */
function listify(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const ok = (id, title, detail) => ({ id, level: 'pass', title, detail });
const tip = (id, title, detail, fix) => ({ id, level: 'tip', title, detail, fix });
const warn = (id, title, detail, fix) => ({ id, level: 'warn', title, detail, fix });
const block = (id, title, detail, fix) => ({ id, level: 'blocker', title, detail, fix });

/* -------------------------------------------------------------------------- */
/* Checks shared by every platform                                            */
/* -------------------------------------------------------------------------- */

function universalChecks(v, ctx, f) {
  const body = v.body || '';

  if (!body.trim() && !(v.headline || '').trim()) {
    f.push(block('empty', 'There is no caption', 'This platform has nothing to post.'));
    return;
  }

  // The problem this exists to catch: the same text on every platform.
  const twins = (ctx.siblings || []).filter(
    (s) => s.platform !== v.platform && (s.body || '').trim() && (s.body || '').trim() === body.trim(),
  );
  if (twins.length) {
    const names = listify(twins.map((t) => PLATFORM_LABELS[t.platform] || t.platform));
    f.push(warn(
      'identical-copy',
      `Identical to your ${names} caption`,
      'Each platform rewards a different shape. Word-for-word reposting is the single clearest signal of cross-posted content, and it reads that way to people too. Rewrite or use the AI rewrite button.',
    ));
  }

  const bait = containsAny(body, BAIT_PHRASES);
  if (bait.length) {
    f.push(warn('bait', 'Reads as engagement bait', `Found: "${bait[0]}". Platforms suppress these and it undercuts your credibility.`));
  }

  const tells = containsAny(body, AI_TELLS);
  if (tells.length) {
    f.push(warn('ai-tell', 'Sounds AI-written', `"${tells[0]}" is a giveaway phrase. Cut it — it doesn't sound like you.`));
  }

  const corp = containsAny(body, CORPORATE_SPEAK);
  if (corp.length) {
    f.push(tip('corporate', 'Corporate filler', `"${corp[0]}" — say it the way you'd say it out loud.`));
  }

  const letters = body.replace(/[^A-Za-z]/g, '');
  const caps = body.replace(/[^A-Z]/g, '');
  if (letters.length > 40 && caps.length / letters.length > 0.4) {
    f.push(warn('shouting', 'Mostly capital letters', 'Reads as shouting and gets throttled on most feeds.'));
  }

  if (/\s{3,}|\n{4,}/.test(body)) {
    f.push(tip('whitespace', 'Odd spacing', 'There are runs of blank lines or spaces that will look broken on mobile.'));
  }
}

/* -------------------------------------------------------------------------- */
/* Shared helpers for length, hooks, hashtags, emoji                          */
/* -------------------------------------------------------------------------- */

function lengthChecks(body, r, f, label = 'caption') {
  const n = len(body);
  if (n > r.maxChars) {
    f.push(block('too-long', `Over the ${r.label} limit`, `${n.toLocaleString()} characters against a hard limit of ${r.maxChars.toLocaleString()}. ${(n - r.maxChars).toLocaleString()} must come out.`));
  } else if (r.idealMin && n < r.idealMin && r.shortFloor && n < r.shortFloor) {
    f.push(tip('short', `Short for ${r.label}`, `${n} characters. Posts in the ${r.idealMin.toLocaleString()}–${r.idealMax.toLocaleString()} range measurably outperform ones under ${r.shortFloor}.`));
  } else if (r.idealMin && r.idealMax && n >= r.idealMin && n <= r.idealMax) {
    f.push(ok('length', 'Length is in the strong range', `${n} characters, inside the ${r.idealMin.toLocaleString()}–${r.idealMax.toLocaleString()} sweet spot.`));
  } else {
    f.push(ok('length', `${label[0].toUpperCase() + label.slice(1)} fits`, `${n.toLocaleString()} of ${r.maxChars.toLocaleString()} characters.`));
  }
  return n;
}

function hookChecks(body, foldChars, f, foldLabel) {
  const visible = beforeFold(body, foldChars);
  const hidden = len(body) > foldChars;
  const first = firstLineOf(body);

  if (hidden && !/[.!?]"?\s*$/.test(visible.trim()) && !visible.includes('\n')) {
    f.push(tip('fold-midsentence', 'The fold cuts mid-sentence', `Readers see "${visible.slice(-45).trim()}…" and then have to tap. That can work as a cliffhanger — make sure it's deliberate.`));
  }

  if (len(first) > foldChars * 1.6) {
    f.push(warn('no-hook-break', 'No line break near the top', `Your first paragraph runs ${len(first)} characters. Break after the hook so the first ${foldChars} characters land on their own.`));
  }

  if (/^(so|well|just|i wanted to|i'm excited to announce|i am excited to|thrilled to announce|happy to share)/i.test(first.trim())) {
    f.push(warn('weak-open', 'Weak opening line', `"${first.slice(0, 60)}…" is throat-clearing. Lead with the claim, not the wind-up.`));
  } else if (first.trim()) {
    f.push(ok('hook', 'Opening line carries a hook', `First ${foldLabel} reads: "${visible.slice(0, 80).trim()}…"`));
  }
  return visible;
}

function hashtagChecks(tags, r, f, platformName) {
  const n = tags.length;
  if (n > r.hashtags.hardMax) {
    f.push(block(
      'tags-over',
      `Too many hashtags for ${platformName}`,
      r.hashtagCapIsPlatformEnforced
        ? `${n} tags. Instagram has enforced a hard five-hashtag cap since 18 Dec 2025 — remove ${n - r.hashtags.hardMax} or the post is rejected.`
        : `${n} tags against a cap of ${r.hashtags.hardMax}. Remove ${n - r.hashtags.hardMax}.`,
    ));
  } else if (n > r.hashtags.max) {
    f.push(warn('tags-many', 'More hashtags than helps', `${n} tags. ${platformName} rewards ${r.hashtags.min}–${r.hashtags.max}; beyond that they read as spam.`));
  } else if (r.hashtags.min > 0 && n < r.hashtags.min) {
    f.push(tip('tags-few', 'Few hashtags', `${n} tags. ${r.hashtags.min}–${r.hashtags.max} niche tags help ${platformName} classify the post.`));
  } else {
    f.push(ok('tags', 'Hashtag count is right', `${n} tag${n === 1 ? '' : 's'}, inside the ${r.hashtags.min}–${r.hashtags.max} range.`));
  }

  if (r.hashtagsBeyondCapAreIgnored && n > r.hashtags.max) {
    f.push(warn(
      'tags-ignored',
      `Only the first ${r.hashtags.max} hashtags will count`,
      `${n} tags. Since Aug 2025 TikTok registers only the first ${r.hashtags.max} for categorisation and distribution — the rest are dead weight in the caption. The post will not be rejected, they just do nothing.`,
    ));
  }

  if (platformName === 'X' && n >= 3) {
    f.push(warn('tags-x-spam', 'Hashtag count trips X\u2019s spam heuristics', `${n} tags. On X, 1\u20132 hashtags earn roughly 21% more engagement than none, but 3+ starts reading as spam and 5+ costs about 17% of organic reach.`));
  }

  const generic = tags.filter((t) => ['love', 'instagood', 'follow', 'viral', 'fyp', 'business', 'marketing', 'ai', 'tech'].includes(t.toLowerCase()));
  if (generic.length) {
    f.push(tip('tags-generic', 'Broad hashtags do little', `#${generic[0]} is too crowded to reach anyone. Niche tags reinforce what the post is about.`));
  }
}

function emojiChecks(body, r, f) {
  const n = emojiCount(body);
  if (n > r.emoji.max) {
    f.push(warn('emoji', 'Heavy emoji use', `${n} emoji. Past about ${r.emoji.max} it reads as noise rather than tone.`));
  }
}

/* -------------------------------------------------------------------------- */
/* Media checks                                                               */
/* -------------------------------------------------------------------------- */

function ratioLabel(w, h) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, h) || 1;
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

function ratioMatches(w, h, pairs, tol = 0.04) {
  const actual = w / h;
  return (pairs || []).some(([a, b]) => Math.abs(actual - a / b) <= tol);
}

/**
 * Checks a multi-image post against the platform's carousel limits, and
 * catches the mixed image/video case that only Instagram tolerates.
 */
function carouselChecks(platform, r, items, f) {
  const n = items.length;
  const c = r.carousel;

  if (!c) {
    f.push(warn(
      'no-carousel',
      `${r.label} takes one file`,
      `${n} files attached, but ${r.label} publishes a single video. Only the first will be used.`,
    ));
    return;
  }

  if (n > c.hardMax) {
    const extra = r.carouselApiCapBelowApp
      ? ` The app itself allows ${r.carouselApiCapBelowApp}, but every scheduling tool goes through the API, which stops at ${c.hardMax}.`
      : '';
    f.push(block('carousel-over', `Too many for ${r.label}`, `${n} files against a limit of ${c.hardMax}. Remove ${n - c.hardMax}.${extra}`));
  } else if (n > c.max) {
    f.push(warn('carousel-many', 'More slides than tends to land', `${n} files. ${r.label} allows up to ${c.hardMax}, but past about ${c.max} people stop swiping.`));
  } else {
    f.push(ok('carousel', `${n}-slide carousel`, `Inside ${r.label}'s limit of ${c.hardMax}.`));
  }

  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size > 1 && platform !== 'instagram') {
    f.push(block('carousel-mixed', 'Images and video mixed', `${r.label} cannot publish a carousel that mixes the two. Instagram is the only one that can.`));
  }

  const portrait = items.filter((i) => i.meta?.width && i.meta?.height && i.meta.height > i.meta.width).length;
  if (portrait && portrait !== n) {
    f.push(tip('carousel-shapes', 'Slides are different shapes', `${portrait} of ${n} are portrait. Carousels crop to the first slide's shape, so the rest may be cut.`));
  }
}

function mediaChecks(platform, r, media, kind, f, hasMedia = true) {
  if ((kind === 'video' || kind === 'image') && !hasMedia) {
    f.push(block('media-missing', 'No file uploaded yet', `This post is set to ${kind} but nothing has been uploaded. Publishing would fail.`));
    return;
  }
  if (kind !== 'video' && kind !== 'image') {
    if (platform === 'instagram' || platform === 'youtube' || platform === 'tiktok') {
      const why = platform === 'youtube'
        ? 'A Short is a video upload — there is nothing to publish without one.'
        : `${r.label} cannot publish a text-only post.`;
      f.push(block('no-media', `${r.label} needs media`, why));
    }
    return;
  }

  const { durationSec, width, height, bytes } = media || {};

  if (kind === 'video' && typeof durationSec === 'number' && durationSec > 0) {
    const vr = r.video || {};
    if (vr.maxSeconds && durationSec > vr.maxSeconds) {
      const mins = (vr.maxSeconds / 60).toFixed(vr.maxSeconds % 60 ? 1 : 0);
      f.push(block('video-long', `Too long for ${r.label}`, `${durationSec.toFixed(0)}s against a ${vr.maxSeconds}s (${mins} min) limit.${platform === 'youtube' ? ' Over 3 minutes it is published as a regular video, not a Short.' : ''}`));
    } else if (vr.reachCliffSeconds && durationSec > vr.reachCliffSeconds) {
      f.push(warn('video-reach-cliff', 'Past the reach cliff', `${durationSec.toFixed(0)}s. Instagram states it does not recommend Reels over ${vr.reachCliffSeconds}s to non-followers, so this reaches your existing audience only. Upload limits above 3 minutes also vary by account, so this may simply be rejected.`));
    } else if (vr.idealMaxSeconds && durationSec > vr.idealMaxSeconds) {
      f.push(tip('video-ideal', 'Longer than the ideal', `${durationSec.toFixed(0)}s. Completion rate — and therefore reach — is strongest under ${vr.idealMaxSeconds}s.`));
    } else {
      f.push(ok('video-length', 'Video length is good', `${durationSec.toFixed(0)}s, comfortably inside ${r.label}'s limits.`));
    }
  }

  if (width && height) {
    const label = ratioLabel(width, height);
    const req = r.aspect?.required;
    const tol = r.aspect?.tolerated || [];
    if (req && !ratioMatches(width, height, req)) {
      if (ratioMatches(width, height, tol)) {
        f.push(warn('aspect-tolerated', `${label} will be cropped`, `${r.label} shows 9:16 full-screen. ${label} gets letterboxed or safe-area cropped — check nothing important sits at the edges.`));
      } else if (width > height) {
        f.push(block('aspect-landscape', 'This video is landscape', `${label} (${width}×${height}). ${platform === 'youtube' ? 'A landscape video is not eligible to be a Short at all.' : 'Instagram Reels needs square or taller.'} Re-crop to 9:16.`));
      } else {
        f.push(warn('aspect-off', `${label} is not 9:16`, `${r.label} is built for 1080×1920. Expect cropping.`));
      }
    } else {
      f.push(ok('aspect', 'Aspect ratio is right', `${label} (${width}×${height}).`));
    }

    const res = r.resolution;
    if (res && height < res.height * 0.75) {
      f.push(warn('low-res', 'Low resolution', `${width}×${height} against a recommended ${res.width}×${res.height}. It will look soft on a phone.`));
    }
  }

  if (bytes && bytes > 95 * 1024 * 1024) {
    f.push(warn('big-file', 'Large file', `${(bytes / 1024 / 1024).toFixed(0)} MB. Uploads this size are slow and sometimes time out.`));
  }
}

/* -------------------------------------------------------------------------- */
/* Per-platform audits                                                        */
/* -------------------------------------------------------------------------- */

function auditLinkedIn(v, ctx, f) {
  const r = RULES.linkedin;
  const body = v.body || '';
  lengthChecks(body, r, f);
  hookChecks(body, r.foldChars, f, `${r.foldChars} characters`);

  const bodyUrls = urlsIn(body);
  const commentHasLink = Boolean((v.first_comment || '').match(URL_RE));
  const pct = Math.round((r.outboundLinkReachCost || 0) * 100);
  const suppression = Math.round((r.firstCommentLinkSuppression || 0) * 100);

  if (bodyUrls.length) {
    // Deliberately a tip, not a warning. The penalty is real but modest, and
    // the usual "fix" is no longer reliably a fix — so this is a judgement
    // call for you to make, not something the tool should decide.
    f.push(tip(
      'link-in-body',
      `Link in the body costs about ${pct}% of reach`,
      `Measured across 1.3M posts in 2026. It is a real cost but a modest one, and moving it to the first comment is no longer a dependable fix — LinkedIn now suppresses comments containing links by up to ${suppression}% and detects posts written to funnel people into their own comments. Keep it here if the click matters more than the reach; drop it if the reach matters more.`,
      { action: 'move-link-to-comment', label: 'Move to first comment anyway', url: bodyUrls[0] },
    ));
  } else if (commentHasLink) {
    f.push(tip(
      'link-in-comment',
      'Link is in the first comment',
      `Worth knowing this stopped being a clean win: LinkedIn suppresses link-bearing comments by up to ${suppression}% and flags posts that exist to funnel people to one. A link in the body costs roughly ${pct}% of reach and at least stays visible.`,
      { action: 'move-link-to-body', label: 'Move link back into the post' },
    ));
  }

  const paras = paragraphsOf(body);
  const longPara = paras.find((p) => len(p) > r.maxParagraphChars);
  if (longPara) {
    f.push(warn('wall-of-text', 'One paragraph is very long', `${len(longPara)} characters without a break. On a phone that is a grey wall — break it into 2–3 sentence chunks.`));
  } else if (paras.length >= 3) {
    f.push(ok('structure', 'Broken into readable chunks', `${paras.length} short paragraphs.`));
  }

  hashtagChecks(collectTags(v, body), r, f, 'LinkedIn');
  emojiChecks(body, r, f);

  const opts = safeJson(v.options);
  if (!opts.visibility) {
    f.push(tip('visibility', 'Visibility not set', 'Defaults to PUBLIC, which is almost always what you want. Set it explicitly if not.'));
  }
  if ((ctx.items || []).length > 1) carouselChecks('linkedin', r, ctx.items, f);
  else mediaChecks('linkedin', r, ctx.media, ctx.mediaKind, f, ctx.hasMedia !== false);
}

function auditX(v, ctx, f) {
  const r = RULES.x;
  const body = v.body || '';
  const premium = !!ctx.settings?.xPremium;
  const opts = safeJson(v.options);
  // Thread mode: Upload-Post splits the text into numbered posts, so the
  // 280-character ceiling stops being a blocker.
  const threadMode = opts.thread === true;
  const cap = premium ? r.maxCharsPremium : r.maxChars;
  const weighted = xWeightedLength(body, r.urlCharCost);
  const urls = urlsIn(body);

  if (weighted > cap && threadMode) {
    const posts = Math.ceil(weighted / (cap - 6));
    f.push(ok('x-thread', 'Will post as a thread', `${weighted} characters becomes roughly ${posts} numbered posts.`));
  } else if (weighted > cap) {
    if (!premium) {
      f.push(block(
        'x-too-long',
        'Over 280 characters',
        `Counts as ${weighted} characters${urls.length ? ` (each link bills as ${r.urlCharCost} regardless of length)` : ''}. Trim ${weighted - cap}, or post it as a thread.`,
        { action: 'split-thread', label: 'Split into a thread' },
      ));
    } else {
      f.push(block('x-too-long-premium', 'Over the Premium limit', `${weighted.toLocaleString()} of ${cap.toLocaleString()} characters.`));
    }
  } else if (weighted >= r.idealMin && weighted <= r.idealMax) {
    f.push(ok('x-length', 'In the strongest length band', `${weighted} characters — the ${r.idealMin}–${r.idealMax} range performs best.`));
  } else if (weighted < r.idealMin) {
    f.push(ok('x-length', 'Short and punchy', `${weighted} characters.`));
  } else {
    f.push(tip('x-length', 'Longer than the ideal band', `${weighted} of ${cap} characters. ${r.idealMin}–${r.idealMax} tends to travel furthest, though 240–259 also does well.`));
  }

  if (urls.length) {
    f.push(ok('x-link-cost', 'Link cost accounted for', `${urls.length} link${urls.length === 1 ? '' : 's'} × ${r.urlCharCost} characters is already included above.`));
  }

  const words = firstLineOf(body).trim().split(/\s+/).filter(Boolean);
  if (words.length > r.hookWords && len(body) > 120) {
    f.push(tip('x-hook', 'Front-load the hook', `The first ${r.hookWords} words decide whether anyone reads on. Yours currently open with "${words.slice(0, r.hookWords).join(' ')}…".`));
  }

  hashtagChecks(collectTags(v, body), r, f, 'X');
  emojiChecks(body, r, f);

  if (ctx.mediaKind === 'video' && ctx.media?.durationSec) {
    const maxV = premium ? r.video.maxSecondsPremium : r.video.maxSeconds;
    if (ctx.media.durationSec > maxV) {
      f.push(block(
        'x-video-long',
        'Video too long for X',
        premium
          ? `${ctx.media.durationSec.toFixed(0)}s. Premium allows up to 4 hours on web and iOS but only 10 minutes on Android, so anything over 10 minutes will not play for a chunk of your audience.`
          : `${ctx.media.durationSec.toFixed(0)}s against the ${maxV}s (2 min 20 s) limit on a free account.`,
      ));
    }
  }
  if ((ctx.items || []).length > 1) carouselChecks('x', r, ctx.items, f);
  if ((ctx.mediaKind === 'video' || ctx.mediaKind === 'image') && ctx.hasMedia === false) {
    f.push(block('media-missing', 'No file uploaded yet', `This post is set to ${ctx.mediaKind} but nothing has been uploaded. Publishing would fail.`));
  }
  if (ctx.mediaKind === 'none') {
    f.push(tip('x-media', 'No media attached', 'Posts with video or an image consistently outperform text-only on X, and media costs no characters.'));
  }
}

function auditInstagram(v, ctx, f) {
  const r = RULES.instagram;
  const body = v.body || '';
  lengthChecks(body, r, f);
  hookChecks(body, r.foldChars, f, `${r.foldChars} characters`);

  if (urlsIn(body).length && r.linksAreNotClickable) {
    f.push(warn(
      'ig-link',
      'Links are not clickable on Instagram',
      'A URL in the caption is dead text people have to retype. Point at your bio link instead.',
      { action: 'link-in-bio', label: 'Replace with "link in bio"' },
    ));
  }

  hashtagChecks(collectTags(v, body), r, f, 'Instagram');
  emojiChecks(body, r, f);
  if ((ctx.items || []).length > 1) carouselChecks('instagram', r, ctx.items, f);
  else mediaChecks('instagram', r, ctx.media, ctx.mediaKind, f, ctx.hasMedia !== false);

  const opts = safeJson(v.options);
  if (ctx.mediaKind === 'video' && !opts.cover_url) {
    f.push(tip('ig-cover', 'No custom cover frame', 'Reels auto-pick a frame, and it is usually a blink or a blur. A chosen cover lifts profile-grid click-through.'));
  }
}

function auditTikTok(v, ctx, f) {
  const r = RULES.tiktok;
  const body = v.body || '';
  const n = len(body);

  if (n > r.maxChars) {
    f.push(block(
      'tt-too-long',
      'Over TikTok\u2019s API caption limit',
      `${n.toLocaleString()} characters. The TikTok app allows ${r.appCaptionLimit.toLocaleString()}, but posts published through an API are capped at ${r.maxChars.toLocaleString()} — which is how this tool publishes. Cut ${(n - r.maxChars).toLocaleString()}.`,
    ));
  } else if (n > r.idealMax) {
    f.push(tip('tt-long', 'Long for TikTok', `${n} characters. TikTok captions do their work in the first line or two; past about ${r.idealMax} few people read on.`));
  } else {
    f.push(ok('tt-length', 'Caption length is good', `${n} of ${r.maxChars.toLocaleString()} characters (the API limit, not the app\u2019s ${r.appCaptionLimit.toLocaleString()}).`));
  }

  hookChecks(body, r.foldChars, f, `${r.foldChars} characters`);

  if (urlsIn(body).length && r.linksAreNotClickable) {
    f.push(warn(
      'tt-link',
      'Links are not clickable on TikTok',
      'A URL in the caption is dead text. Point at your bio link instead.',
      { action: 'link-in-bio', label: 'Replace with "link in bio"' },
    ));
  }

  hashtagChecks(collectTags(v, body), r, f, 'TikTok');
  emojiChecks(body, r, f);
  if ((ctx.items || []).length > 1) carouselChecks('tiktok', r, ctx.items, f);
  else mediaChecks('tiktok', r, ctx.media, ctx.mediaKind, f, ctx.hasMedia !== false);

  // Length is a genuine strategy fork here, so surface the tradeoff rather
  // than pretending one number is correct.
  const vr = r.video;
  const dur = ctx.media?.durationSec;
  if (ctx.mediaKind === 'video' && typeof dur === 'number' && dur > 0 && dur <= vr.maxSeconds) {
    if (dur >= vr.idealMinSeconds && dur <= vr.idealMaxSeconds) {
      f.push(ok('tt-duration', 'In the strongest engagement band', `${dur.toFixed(0)}s. Engagement rate peaks around ${vr.idealMinSeconds}\u2013${vr.idealMaxSeconds}s across 6M+ brand videos.`));
    } else if (dur < vr.idealMinSeconds) {
      f.push(tip('tt-short', 'Very short', `${dur.toFixed(0)}s. Under ${vr.idealMinSeconds}s there is rarely enough to hold a rewatch, which is what TikTok rewards.`));
    } else if (dur >= vr.viewsFavourSeconds) {
      f.push(tip('tt-long-video', 'Long — trades engagement rate for views', `${dur.toFixed(0)}s. Videos this length take far more median views (~11,000 against ~1,000 for 15\u201330s) but a much lower engagement rate. Fine if reach is the goal.`));
    } else {
      f.push(tip('tt-duration', 'Past the engagement sweet spot', `${dur.toFixed(0)}s. ${vr.idealMinSeconds}\u2013${vr.idealMaxSeconds}s peaks for engagement rate; ${vr.viewsFavourSeconds}s+ trades that for raw views.`));
    }
  }

  const opts = safeJson(v.options);
  if (opts.post_mode === 'MEDIA_UPLOAD') {
    f.push(tip('tt-draft', 'Going to TikTok drafts, not live', 'Draft mode is set, so this lands in your TikTok inbox for you to publish by hand rather than going out on schedule.'));
  }
  if (!opts.privacy_level) {
    f.push(tip('tt-privacy', 'Privacy not set', 'Defaults to public. TikTok requires this explicitly, so set it if you want anything else.'));
  }
}

function auditYouTube(v, ctx, f) {
  const r = RULES.youtube;
  const opts = safeJson(v.options);
  // 'short' holds you to the Shorts rules; 'video' is a regular upload where
  // length and landscape are fine. YouTube itself classifies by length and
  // shape — this decides which rules the audit applies.
  const longForm = opts.youtube_format === 'video';
  const title = v.headline || '';
  const desc = v.body || '';

  if (!title.trim()) {
    f.push(block('yt-no-title', 'No title', 'YouTube requires a title, and in the Shorts feed it is the main thing people read.'));
  } else {
    const n = len(title);
    if (n > r.titleMaxChars) {
      f.push(block('yt-title-long', 'Title over 100 characters', `${n} characters. YouTube will reject it. Cut ${n - r.titleMaxChars}.`));
    } else if (n > r.titleIdealMax) {
      f.push(warn('yt-title-trim', 'Title will be truncated in the feed', `${n} characters, but only about ${r.titleVisibleChars} show in the Shorts feed. Put the hook in the first ${r.titleVisibleChars} \u2014 though note the full title does show on your channel page, in search and in suggested, where it does most of its work.`));
    } else {
      f.push(ok('yt-title', 'Title length is good', `${n} of ${r.titleMaxChars} characters, with the hook inside the visible ${r.titleVisibleChars}.`));
    }
    if (r.shortsTagUnnecessary && /#shorts/i.test(title)) {
      f.push(tip(
        'yt-shorts-tag',
        '#Shorts is no longer needed',
        'Since Oct 2024 YouTube classifies Shorts automatically from length and orientation. The tag just eats title space.',
        { action: 'strip-shorts-tag', label: 'Remove #Shorts from title' },
      ));
    }
    if (/^(watch|check out|you won't believe)/i.test(title.trim())) {
      f.push(warn('yt-title-weak', 'Generic title opening', 'Open with the specific claim or number, not a command to watch.'));
    }
  }

  if (len(desc) > r.maxChars) {
    f.push(block('yt-desc-long', 'Description over 5,000 characters', `${len(desc).toLocaleString()} characters.`));
  } else if (!desc.trim()) {
    f.push(tip('yt-desc-empty', 'Empty description', 'The first two lines are indexed and shown. Even one sentence plus a link helps.'));
  } else {
    f.push(ok('yt-desc', 'Description present', `${len(desc).toLocaleString()} of ${r.maxChars.toLocaleString()} characters.`));
  }

  hashtagChecks(collectTags(v, desc), r, f, 'YouTube');
  emojiChecks(desc, r, f);

  const dur = ctx.media?.durationSec;
  const w = ctx.media?.width;
  const h = ctx.media?.height;
  const vertical = w && h ? h >= w : null;

  if (longForm) {
    // Hold it to the regular-video rules instead of the Shorts ones.
    const lf = r.longForm;
    mediaChecks('youtube', { ...r, label: lf.label, video: { maxSeconds: lf.maxSeconds }, aspect: lf.aspect, resolution: lf.resolution },
      ctx.media, ctx.mediaKind, f, ctx.hasMedia !== false);
    if (typeof dur === 'number' && dur > 0 && dur <= r.video.maxSeconds && vertical) {
      f.push(warn(
        'yt-would-be-short',
        'This will become a Short anyway',
        `${dur.toFixed(0)}s and square-or-taller, so YouTube classifies it as a Short whatever you intend. Make it longer than ${r.video.maxSeconds}s or landscape to publish it as a regular video.`,
      ));
    } else if (typeof dur === 'number' && dur > 0) {
      f.push(ok('yt-longform', 'Will publish as a regular video', `${(dur / 60).toFixed(1)} min${vertical === false ? ', landscape' : ''} — outside the Shorts criteria, so it lands on your channel as a normal upload.`));
    }
    if (lf.thumbnailSupported && !safeJson(v.options).thumbnail_url) {
      f.push(tip('yt-thumb', 'No custom thumbnail', 'Regular videos support one and it is the main thing people click. Shorts do not.'));
    }
  } else {
    if ((ctx.items || []).length > 1) carouselChecks('youtube', r, ctx.items, f);
  else mediaChecks('youtube', r, ctx.media, ctx.mediaKind, f, ctx.hasMedia !== false);
    if (ctx.mediaKind === 'video' && dur && dur <= r.video.maxSeconds && vertical) {
      f.push(ok('yt-qualifies', 'Qualifies as a Short', `Square-or-taller and ${dur.toFixed(0)}s — YouTube will classify this as a Short automatically.`));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

function timingCheck(platform, ctx, f) {
  if (!ctx.scheduledAt) return;
  const bt = BEST_TIMES[platform];
  if (!bt) return;
  const local = new Date(new Date(ctx.scheduledAt).toLocaleString('en-US', { timeZone: ctx.timezone || 'UTC' }));
  const day = local.getDay();
  const hour = local.getHours();
  const inDay = bt.days.includes(day);
  const inHour = bt.hours.some(([a, b]) => hour >= a && hour < b);
  if (inDay && inHour) {
    f.push(ok('timing', 'Good slot', `${bt.note}`));
  } else {
    const windows = bt.hours.map(([a, b]) => `${a}:00–${b}:00`).join(' or ');
    f.push(tip('timing', 'Outside the strongest window', `Scheduled for ${local.toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })}. ${bt.note} Try ${windows} local. Timing is worth maybe 10–20% — a good post at an average hour still beats an average post at the perfect one — but posting while your audience sleeps starves the first-hour engagement that ranking keys off.`));
  }
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

const AUDITORS = {
  linkedin: auditLinkedIn,
  x: auditX,
  instagram: auditInstagram,
  tiktok: auditTikTok,
  youtube: auditYouTube,
};

const WEIGHT = { blocker: 30, warn: 10, tip: 3, pass: 0 };

/**
 * @param {object} variant  a row from `variants`
 * @param {object} ctx      { media, mediaKind, siblings, scheduledAt, timezone, settings }
 */
export function auditVariant(variant, ctx = {}) {
  const findings = [];
  const platform = variant.platform;
  universalChecks(variant, ctx, findings);
  if (!findings.some((x) => x.id === 'empty')) {
    (AUDITORS[platform] || (() => {}))(variant, ctx, findings);
    timingCheck(platform, ctx, findings);
  }

  let score = 100;
  for (const f of findings) score -= WEIGHT[f.level] || 0;
  score = Math.max(0, Math.min(100, score));

  const blockers = findings.filter((f) => f.level === 'blocker');
  const order = { blocker: 0, warn: 1, tip: 2, pass: 3 };
  findings.sort((a, b) => order[a.level] - order[b.level]);

  return {
    platform,
    label: PLATFORM_LABELS[platform] || platform,
    score,
    grade: score >= 90 ? 'Ready' : score >= 75 ? 'Good' : score >= 50 ? 'Needs work' : 'Rework',
    canSchedule: blockers.length === 0,
    counts: {
      blocker: blockers.length,
      warn: findings.filter((f) => f.level === 'warn').length,
      tip: findings.filter((f) => f.level === 'tip').length,
      pass: findings.filter((f) => f.level === 'pass').length,
    },
    findings,
  };
}

export function auditPost(post, variants, settings = {}, items = []) {
  const media = items[0]?.meta || JSON.parse(post.media_meta || '{}');
  const enabled = variants.filter((v) => v.enabled);
  const reports = {};
  for (const v of enabled) {
    reports[v.platform] = auditVariant(v, {
      media,
      mediaKind: post.media_kind,
      siblings: enabled,
      // A purged post did have its file; it was deleted after publishing.
      hasMedia: Boolean(post.media_key) || items.length > 0 || media.purged === true,
      items,
      scheduledAt: post.scheduled_at,
      timezone: post.timezone,
      settings,
    });
  }
  const all = Object.values(reports);
  return {
    reports,
    overall: all.length ? Math.round(all.reduce((s, r) => s + r.score, 0) / all.length) : 0,
    canSchedule: all.length > 0 && all.every((r) => r.canSchedule),
  };
}
