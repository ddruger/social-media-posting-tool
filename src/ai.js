/**
 * AI REWRITE (on demand)
 * ======================
 * The mechanical composer runs on every keystroke and needs no API key. This
 * is the separate "Rewrite with AI" button: it rewrites ONE platform's draft
 * properly, in Daniel's voice, with that platform's rules in the prompt.
 */

import { RULES, PLATFORM_LABELS } from './rules.js';

const API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

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
  if (!env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY is not set. Run: npx wrangler secret put ANTHROPIC_API_KEY — or just use the mechanical drafts, which need no key.');
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

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
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
