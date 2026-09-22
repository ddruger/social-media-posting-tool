/**
 * AI REWRITE (on demand)
 * ======================
 * The mechanical composer runs on every keystroke and needs no API key. This
 * is the separate "Rewrite with AI" button: it rewrites ONE platform's draft
 * properly, in Daniel's voice, with that platform's rules in the prompt.
 */

import { RULES, PLATFORM_LABELS } from './rules.js';

const DEFAULT_API = 'https://api.anthropic.com/v1/messages';

// Overridable so the idea builder can be exercised against a mock rather than
// spending real tokens. Leave unset in normal use.
const apiOf = (env) => env.ANTHROPIC_BASE_URL || DEFAULT_API;
const DEFAULT_MODEL = 'claude-sonnet-5';

// People type something to get past a form that demands a value. Treat those
// as "no key" so the button reports the real situation rather than relaying a
// confusing 401 from Anthropic.
const PLACEHOLDERS = new Set([
  'none', 'skip', 'n/a', 'na', 'no', 'nope', 'false', 'null', 'undefined',
  'x', '-', '.', 'todo', 'changeme', 'placeholder', 'optional', 'blank', 'empty',
]);

/** The usable Anthropic key, or null if one was never really provided. */
export function aiKey(env) {
  const key = (env.ANTHROPIC_API_KEY || '').trim();
  if (!key || key.length < 20 || PLACEHOLDERS.has(key.toLowerCase())) return null;
  return key;
}

const NO_KEY_MESSAGE =
  'The AI rewrite needs an Anthropic API key, which this deployment does not have. ' +
  'Everything else — the five drafts, the audit, scheduling — works without one. ' +
  'To switch it on: console.anthropic.com for a key, then in Cloudflare open your ' +
  'Worker, Settings, Variables and Secrets, and add ANTHROPIC_API_KEY as a Secret.';

/** Condensed from the daniels-voice skill. */
const VOICE = `You are ghostwriting for Daniel Druger. It must sound like him, not like AI and not like a LinkedIn influencer.

Who he is: VP of Product at Universal Ads (Comcast), co-host of the ADSN show/newsletter with James Borow, host of the No Permission podcast, angel investor in CPG brands, USC Marshall MBA '13, former SaaS founder (exited), based in LA.

Voice:
- Writes like he talks. Warm, direct, conversational. Contractions always.
- Confident with opinions, but invites conversation rather than shutting it down.
- Self-deprecating ("I'm old!"). Never takes himself too seriously.
- Gets to the point fast. No throat-clearing, no wind-up.
- Short paragraphs, 3-4 sentences max. Single-sentence paragraphs are common.
- Punchy fragments for emphasis: "Stop typing. Start thinking. Then type."
- Leads with a bold claim, not a question and not a hedge.
- Provocative but not hostile: "The wild part is how many teams still aren't shipping API-first. In 2026. It's kind of hysterical."
- Talks TO the reader: "Here's the test I'd run on your own roadmap."
- References real tools and companies (Claude Code, Cursor, Amazon DSP), never abstractions.
- Genuine, specific enthusiasm. Never generic praise.

Never: corporate speak (synergize, leverage as a verb, circle back, move the needle); long formal paragraphs; excessive hedging; emoji overload (one max, and only if the tone calls for it); AI tells ("I'd be happy to", "Certainly!", "Great question", "delve into", "game-changer", "In conclusion"); engagement bait ("like and share", "tag a friend").

The test: would Daniel say this out loud to someone over coffee? If it sounds like a corporate template, rewrite it.`;

function platformBrief(platform, settings = {}) {
  const r = RULES[platform];
  switch (platform) {
    case 'linkedin':
      return `Target: LinkedIn.
- Hard limit ${r.maxChars} characters. Aim for ${r.idealMin}-${r.idealMax}, which measurably outperforms short posts.
- Only the first ${r.foldChars} characters show before "…see more". The opening line has to earn the tap. Put a line break right after the hook.
- Short paragraphs separated by blank lines. Never a wall of text.
- Do NOT put a URL in the body — LinkedIn suppresses outbound links. If there is a link, leave it out and I will put it in the first comment.
- ${r.hashtags.min}-${r.hashtags.max} niche hashtags at the very end.`;
    case 'x': {
      const cap = settings.xPremium ? r.maxCharsPremium : r.maxChars;
      return `Target: X.
- Hard limit ${cap} characters${settings.xPremium ? ' (Premium)' : ''}. Any URL always bills as ${r.urlCharCost} characters regardless of its real length.
- Strongest band is ${r.idealMin}-${r.idealMax} characters. Shorter and sharper beats complete.
- The first ${r.hookWords} words decide whether anyone reads on. Front-load the claim.
- At most ${r.hashtags.max} hashtags; zero is usually better on X.
- This is not a summary of the LinkedIn post. It is the single sharpest idea, standing alone.`;
    }
    case 'threads':
      return `Target: Threads.
- Hard limit ${r.maxChars} characters, and Threads counts emoji as several characters each. Aim for ${r.idealMin}-${r.idealMax} — Threads reads fast and rewards short.
- Only about ${r.foldChars} characters show before "… more", so the hook has to land in the first line.
- Threads has NO hashtags. Do not put any # in the caption; they are plain text there and classify nothing. Instead return a single "topic" of 1-50 words-or-characters that best describes the post (no periods, no ampersands). Spaces are allowed in it.
- Links ARE clickable here and carry no reach penalty, so a URL in the body is fine.
- Conversational and opinionated. Threads is a talking feed, not a broadcast one — writing that invites a reply outperforms writing that closes the subject.
- This is not the X post reworded. X rewards the sharpest compression; Threads rewards the more human, more open version of the same thought.`;
    case 'tiktok':
      return `Target: TikTok caption.
- Hard limit ${r.maxChars} characters through the API, but aim for ${r.idealMin}-${r.idealMax}. The caption supports the video, it does not repeat it.
- Only about ${r.foldChars} characters show before "more".
- ${r.hashtags.min}-${r.hashtags.max} hashtags. Since Aug 2025 only the first ${r.hashtags.max} count for distribution, so more is wasted.
- URLs are NOT clickable here. Never include one.
- Casual and direct. No corporate framing.`;
    case 'instagram':
      return `Target: Instagram Reels caption.
- Limit ${r.maxChars} characters; only the first ${r.foldChars} show before "…more".
- Instagram enforces a hard cap of ${r.hashtags.hardMax} hashtags (since Dec 2025). Use ${r.hashtags.min}-${r.hashtags.max} niche ones at the end.
- URLs are NOT clickable here. Never include one — say "Link in bio" if a link matters.
- More casual and more human than LinkedIn. Lead with the hook in the first ${r.foldChars} characters.`;
    case 'youtube':
      return `Target: YouTube Shorts.
- Return a TITLE and a DESCRIPTION.
- Title: hard max ${r.titleMaxChars} characters, but only about ${r.titleVisibleChars} show in the Shorts feed, so the hook must live in the first ${r.titleVisibleChars}. Aim for under ${r.titleIdealMax}. Lead with the specific claim or number — never "Watch this" or "Check out".
- Do NOT put #Shorts in the title; YouTube classifies Shorts automatically now and it just wastes space.
- Description: up to ${r.maxChars} characters, first two lines are what people see. A link is fine here.
- At most ${r.hashtags.max} hashtags.`;
    default:
      return '';
  }
}

export async function rewrite(env, { platform, master, current, linkUrl, mediaKind, settings = {}, instruction = '' }) {
  const key = aiKey(env);
  if (!key) {
    const e = new Error(NO_KEY_MESSAGE);
    e.status = 400;
    throw e;
  }
  const wantsTitle = platform === 'youtube';

  const prompt = `${platformBrief(platform, settings)}

Here is the source material Daniel wrote:
"""
${master || current || ''}
"""
${current && current !== master ? `\nHere is the current draft for this platform, which you are improving:\n"""\n${current}\n"""` : ''}
${linkUrl ? `\nThe link for this post is: ${linkUrl}` : ''}
${mediaKind === 'video' ? '\nThis post has a vertical video attached, so the caption supports the video rather than describing it.' : ''}
${instruction ? `\nExtra direction from Daniel: ${instruction}` : ''}

Rewrite this for ${PLATFORM_LABELS[platform]}. Keep his actual point and his actual opinions — you are changing the shape, not the substance. Do not invent facts, numbers, names or claims that are not in the source.

Respond with JSON only, no prose and no code fence:
${wantsTitle
  ? '{"title": "...", "body": "...", "hashtags": ["tag", "tag"]}'
  : '{"body": "...", "hashtags": ["tag", "tag"]}'}
Hashtags must not include the "#" character.`;

  const res = await fetch(apiOf(env), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 2000,
      system: VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message || `Anthropic API returned ${res.status}`);
    e.status = res.status;
    throw e;
  }

  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const json = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    // If it ever answers in prose, treat the whole reply as the body rather
    // than failing the request.
    parsed = { body: text };
  }

  return {
    body: String(parsed.body || '').trim(),
    headline: wantsTitle ? String(parsed.title || '').trim() : '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((t) => String(t).replace(/^#/, '')) : [],
  };
}

/* -------------------------------------------------------------------------- */
/* The idea builder                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A riffing partner, not a generator.
 *
 * The whole value here is the conversation that sharpens a vague thought into
 * something worth posting. An agent that immediately produces a polished post
 * is useless — you anchor on the first draft and never do the thinking. So
 * this one interrogates, offers angles, and refuses to write the post until
 * it is asked to.
 */
const RIFF_SYSTEM = `${VOICE}

You are Daniel's thinking partner for social posts. You are NOT writing the post yet.

Your job is to make the idea sharper than it arrived. Specifically:

- **Interrogate vagueness.** "Teams aren't shipping fast enough" is not a post. Ask which teams, what he actually saw, what the number was. The specific detail IS the post; without it there is nothing.
- **Find the angle.** Most ideas have an obvious take and a better one. Offer 2–3 concrete angles — the contrarian read, the one nobody says out loud, the one grounded in something he personally saw. Name them briefly, don't lecture.
- **Push back.** If the take is conventional wisdom, say so. If it would read as self-congratulatory, say so. If he has no real evidence for the claim, say so. He does not need a cheerleader, and a post that everyone already agrees with is a waste of a slot.
- **Draw out what only he can say.** He runs product at Universal Ads, hosts two podcasts, angel invests, was a founder. The useful post is the one that needs that vantage point. Ask what he has seen that others have not.

How to behave:
- Ask at most TWO questions at a time. This is a conversation, not an intake form.
- Be brief. Two or three short paragraphs, or a few bullets. He is busy.
- Talk like him: direct, warm, no corporate filler, no "great question!", no preamble.
- When the idea is sharp enough, say so plainly and tell him to hit "Build the post" — do not write the post yourself unless he explicitly asks.
- If he gives you something already sharp, don't manufacture objections. Say it's ready.`;

export async function riff(env, { messages, settings = {} }) {
  const key = aiKey(env);
  if (!key) { const e = new Error(NO_KEY_MESSAGE); e.status = 400; throw e; }

  const res = await fetch(apiOf(env), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 1200,
      system: RIFF_SYSTEM,
      messages: (messages || []).slice(-24).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data?.error?.message || `Anthropic returned ${res.status}`); e.status = res.status; throw e; }
  return { content: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
}

/**
 * Turns the conversation into the one caption everything else is built from.
 * Deliberately returns the *baseline* post: the per-platform shaping is the
 * composer's job, and doing it twice would fight itself.
 */
export async function buildFromIdea(env, { messages, settings = {} }) {
  const key = aiKey(env);
  if (!key) { const e = new Error(NO_KEY_MESSAGE); e.status = 400; throw e; }

  const transcript = (messages || [])
    .map((m) => `${m.role === 'assistant' ? 'PARTNER' : 'DANIEL'}: ${m.content}`)
    .join('\n\n');

  const prompt = `Here is the conversation where Daniel worked out what he wants to say:

"""
${transcript}
"""

Write the post that conversation arrived at.

This is the BASELINE version — the full thought, written in his voice. It gets reshaped per platform afterwards, so do not trim it for any particular character limit, and do not write five versions.

Rules:
- Lead with the claim. No throat-clearing, no "I've been thinking about…".
- Use the specific details he gave you. If he named a number, a company, a thing he saw, it goes in. Invent nothing he did not say.
- Short paragraphs. Fragments for emphasis where it earns it.
- End where the thought ends. No "what do you think?" tacked on.
- 3–5 hashtags at the very end, lowercase, specific rather than broad.

Also judge which platforms this actually suits. A nuanced argument is LinkedIn. A single sharp line is X. An opinion that invites an argument back is Threads. Something that needs a visual is Instagram or TikTok. Don't pick all of them out of habit — pick where it genuinely lands.

Respond with JSON only, no prose, no code fence:
{"name": "short internal label, 3-6 words", "caption": "the post", "platforms": ["linkedin"], "why": "one sentence on the platform choice"}`;

  const res = await fetch(apiOf(env), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 2000,
      system: VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data?.error?.message || `Anthropic returned ${res.status}`); e.status = res.status; throw e; }

  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  let parsed;
  try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { parsed = { caption: text }; }

  const valid = new Set(['linkedin', 'x', 'threads', 'instagram', 'tiktok', 'youtube']);
  return {
    name: String(parsed.name || '').trim(),
    caption: String(parsed.caption || '').trim(),
    platforms: (Array.isArray(parsed.platforms) ? parsed.platforms : []).filter((p) => valid.has(p)),
    why: String(parsed.why || '').trim(),
  };
}
