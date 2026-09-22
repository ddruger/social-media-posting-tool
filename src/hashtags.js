/**
 * HASHTAG RECOMMENDER
 * ===================
 * Suggests tags by matching what the caption is actually about against a
 * library tuned to Daniel's territory — ad tech, product, AI, media,
 * podcasting, startups and investing.
 *
 * Deliberately keyword-based rather than AI: it runs instantly, costs nothing,
 * needs no key, and a hashtag is a classification problem, not a creative one.
 * The AI rewrite already proposes tags when you want a fresh take.
 *
 * Each entry is [tag, weight, ...keywords]. Weight nudges the broadly useful
 * ones above the niche ones when both match.
 */

const LIBRARY = [
  // Ad tech
  ['adtech', 3, 'ad tech', 'adtech', 'advertising', 'ad ', 'ads', 'dsp', 'ssp', 'programmatic', 'inventory', 'campaign'],
  ['programmatic', 2, 'programmatic', 'rtb', 'real time bidding', 'auction', 'bidder', 'dsp', 'exchange'],
  ['ctv', 2, 'ctv', 'connected tv', 'streaming tv', 'ott', 'living room', 'tv advertising'],
  ['retailmedia', 2, 'retail media', 'retailer', 'commerce media', 'onsite', 'offsite'],
  ['adops', 1, 'ad ops', 'adops', 'trafficking', 'campaign setup', 'pacing'],
  ['martech', 1, 'martech', 'marketing stack', 'marketing technology', 'crm'],
  ['measurement', 2, 'measurement', 'attribution', 'incrementality', 'mmm', 'lift', 'roas', 'roi'],
  ['identity', 1, 'identity', 'cookie', 'cookies', 'signal loss', 'privacy sandbox', 'first party data'],
  ['privacy', 1, 'privacy', 'consent', 'gdpr', 'ccpa', 'tracking'],

  // Product
  ['product', 3, 'product', 'roadmap', 'feature', 'shipping', 'shipped', 'launch', 'backlog', 'prioriti'],
  ['productmanagement', 2, 'product manager', 'product management', ' pm ', 'roadmap', 'discovery', 'user research'],
  ['buildinpublic', 2, 'building in public', 'build in public', 'shipping', 'we built', 'i built', 'prototype'],
  ['platform', 2, 'platform', 'api', 'apis', 'integration', 'developer', 'sdk', 'ecosystem'],
  ['apis', 2, 'api', 'apis', 'endpoint', 'integration', 'webhook', 'developer experience'],
  ['ux', 1, 'ux', 'user experience', 'design', 'usability', 'onboarding', 'friction'],

  // AI
  ['ai', 3, ' ai ', 'ai.', 'ai,', 'artificial intelligence', 'model', 'llm', 'agent', 'automation', 'claude', 'gpt', 'copilot'],
  ['genai', 2, 'generative', 'genai', 'gen ai', 'llm', 'prompt', 'foundation model'],
  ['automation', 1, 'automation', 'automate', 'workflow', 'agent', 'pipeline', 'no code'],

  // Media, podcasting, creators
  ['podcasting', 2, 'podcast', 'episode', 'guest', 'recording', 'interview', 'show'],
  ['media', 2, 'media', 'publisher', 'newsroom', 'content', 'audience', 'distribution'],
  ['creatoreconomy', 2, 'creator', 'creators', 'influencer', 'newsletter', 'audience building'],
  ['videomarketing', 1, 'video', 'reels', 'shorts', 'clip', 'youtube', 'tiktok'],

  // Startups and investing
  ['startups', 3, 'startup', 'startups', 'founder', 'founders', 'early stage', 'seed', 'mvp'],
  ['founders', 2, 'founder', 'founders', 'co-founder', 'solo founder', 'building a company'],
  ['venturecapital', 2, 'vc', 'venture', 'raised', 'fundraising', 'term sheet', 'cap table', 'valuation'],
  ['angelinvesting', 2, 'angel', 'angel investing', 'investing', 'invested', 'portfolio company'],
  ['saas', 2, 'saas', 'subscription', 'arr', 'mrr', 'churn', 'retention', 'b2b software'],
  ['b2b', 2, 'b2b', 'enterprise', 'procurement', 'sales cycle', 'buyer', 'deal'],

  // Work and growth
  ['growth', 2, 'growth', 'acquisition', 'funnel', 'conversion', 'activation', 'scale'],
  ['marketing', 2, 'marketing', 'brand', 'positioning', 'messaging', 'campaign', 'demand gen'],
  ['leadership', 2, 'leadership', 'manager', 'managing', 'team', 'culture', 'hiring', 'lead'],
  ['careers', 1, 'career', 'job', 'hiring', 'interview', 'recruiting', 'promotion'],
  ['strategy', 1, 'strategy', 'strategic', 'bet', 'thesis', 'positioning', 'moat'],
  ['data', 1, 'data', 'analytics', 'dashboard', 'metrics', 'instrumentation', 'warehouse'],
];

/**
 * @param {string} text      the caption to read
 * @param {object} rules     that platform's rule block, for its tag ceiling
 * @param {string[]} already tags already on the post, so they are not re-offered
 */
export function suggestTags(text, rules, already = []) {
  const low = ` ${String(text || '').toLowerCase()} `;
  const have = new Set(already.map((t) => String(t).replace(/^#/, '').toLowerCase()));

  const scored = [];
  for (const [tag, weight, ...keywords] of LIBRARY) {
    if (have.has(tag)) continue;
    let hits = 0;
    for (const k of keywords) if (low.includes(k)) hits += 1;
    if (hits) scored.push({ tag, score: hits * 2 + weight, hits });
  }
  scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  // Offer a couple more than the platform allows, so there is a choice.
  const cap = (rules?.hashtags?.max || 5) + 2;
  return {
    suggestions: scored.slice(0, cap).map((s) => s.tag),
    // What the platform will actually reward, for the hint text.
    idealMin: rules?.hashtags?.min ?? 0,
    idealMax: rules?.hashtags?.max ?? 5,
    hardMax: rules?.hashtags?.hardMax ?? 30,
  };
}
