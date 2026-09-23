/**
 * PLATFORM RULEBOOK
 * =================
 * Every number the audit checks against lives in this one file, each with the
 * source it came from and when that source was checked. When a platform
 * changes something, edit the number here — nothing else needs to change.
 *
 * Sources are marked:
 *   [OFFICIAL] the platform said it themselves
 *   [STUDY]    measured research, with the sample size noted
 *   [SOFT]     widely-repeated practitioner consensus, no hard dataset
 *
 * Treat [SOFT] numbers as directional. They drive tips, never blockers.
 *
 * Last reviewed: 2026-09-22
 */

export const LAST_REVIEWED = '2026-09-22';

export const PLATFORMS = ['linkedin', 'x', 'threads', 'instagram', 'tiktok', 'youtube'];

export const PLATFORM_LABELS = {
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube Shorts',
};

export const RULES = {
  linkedin: {
    label: 'LinkedIn',
    // [OFFICIAL] Hard limit — LinkedIn rejects posts above this.
    maxChars: 3000,
    // [OFFICIAL/STUDY] The "…see more" fold: ~140 chars on mobile, ~210 on
    // desktop. We audit against the mobile number because most reading is
    // mobile, and a hook that fits 140 also works on desktop.
    foldChars: 140,
    foldCharsDesktop: 210,
    // [STUDY] AuthoredUp, 372,126 personal-profile posts, Sep 2025–Feb 2026.
    // Peak median engagement 2.61–2.67% in the 1,301–2,500 band, against
    // 2.10% for posts under 400 characters (+27%).
    idealMin: 1300,
    idealMax: 2500,
    shortFloor: 400,
    // [OFFICIAL] LinkedIn's own guidance: 3–5, and no more than 5. Past that
    // it reads as spam and distribution suffers.
    hashtags: { min: 3, max: 5, hardMax: 10 },

    // ── Outbound links ───────────────────────────────────────────────────
    // [STUDY] Van der Blom "Algorithm Insights" 2026, 1.3M posts / 50k
    // creators: ONE external link in the post body costs ~18.8% of median
    // reach. Real, but modest.
    // [OFFICIAL] LinkedIn's MultiImage API takes 2–20. Third-party paths
    // commonly cap at 9, and past that the gallery reads as a dump, so 9 is
    // the advised ceiling and 20 the hard one.
    carousel: { min: 2, max: 9, hardMax: 20 },
    // [OFFICIAL] LinkedIn's Images API takes JPEG, PNG and GIF, and animates
    // GIFs up to 250 frames. Cap is on total pixels, not file size.
    image: { formats: ['jpeg', 'png', 'gif'], animatesGif: true, maxPixels: 36152320, gifMaxFrames: 250 },
    // [OFFICIAL] LinkedIn's API cannot create a draft. Drafts exist in the
    // LinkedIn UI only — nothing published through an API can land in them.
    draft: { supported: false, reason: 'LinkedIn drafts exist only in the app; the API cannot create one.' },
    comments: { supported: true },
    outboundLinkReachCost: 0.188,
    // [STUDY] Same report: LinkedIn now suppresses COMMENTS containing
    // external links by up to 80%, and detects "bridge behaviour" where a
    // post exists to funnel people to a link in its own first comment.
    // So the old link-in-first-comment trick is no longer a free win — which
    // is why this tool no longer does it automatically.
    firstCommentLinkSuppression: 0.80,
    firstCommentWorkaroundReliable: false,
    // [STUDY] Saywhat, ~400k posts, Q1 2026, pointing the other way: posts
    // carrying several external links out-performed posts with none. Kept
    // here as the counter-evidence that stops this being stated as a law.
    multiLinkCounterEvidence: true,

    // [SOFT] A paragraph longer than this is a grey wall on a phone.
    maxLinesBeforeBreak: 3,
    maxParagraphChars: 350,
    emoji: { max: 8 },
    // [OFFICIAL] 10 min ceiling. [SOFT] shorter holds attention better.
    video: { maxSeconds: 600, idealMaxSeconds: 90, minWidth: 256 },
    aspect: { preferred: [[9, 16], [1, 1], [4, 5]] },
  },

  x: {
    label: 'X',
    // [OFFICIAL] 280 standard, 25,000 with Premium.
    maxChars: 280,
    maxCharsPremium: 25000,
    // [OFFICIAL] Every URL is rewritten to t.co and always bills as 23
    // characters, however long the real link is. Media costs nothing.
    // [OFFICIAL] Four images per post, hard.
    carousel: { min: 2, max: 4, hardMax: 4 },
    // [OFFICIAL] X takes JPEG, PNG, GIF and WebP. One animated GIF per post,
    // and a GIF cannot sit alongside photos or a video.
    image: { formats: ['jpeg', 'png', 'gif', 'webp'], animatesGif: true, maxBytes: 5 * 1024 * 1024, gifMaxBytes: 15 * 1024 * 1024, gifIsExclusive: true },
    // [OFFICIAL] No draft for a normal post. (Articles have a draft flag,
    // which is a different thing entirely.)
    draft: { supported: false, reason: 'X has no draft for regular posts over the API.' },
    // [OFFICIAL] Upload-Post's comment endpoints now list X as fully
    // supported (read, reply and delete), alongside Instagram, Facebook,
    // YouTube, LinkedIn, TikTok and Bluesky. Checked 2026-09-22.
    comments: { supported: true, canDelete: true, moderation: [] },
    urlCharCost: 23,
    // [STUDY/SOFT] 71–100 characters remains the most-cited high-engagement
    // band and is still repeated across 2026 analyses. The original is an
    // older Buffer dataset, so this drives a tip, never a blocker. Note that
    // 240–259 also over-performs — this is not a narrow optimum.
    idealMin: 71,
    idealMax: 100,
    // [STUDY] 1–2 hashtags ≈ +21% engagement and +55% retweets against none;
    // 3+ starts tripping spam heuristics; 5+ costs ~17% of organic reach.
    hashtags: { min: 0, max: 2, hardMax: 3 },
    emoji: { max: 3 },
    // [SOFT] The first 8–12 words decide whether anyone reads on.
    hookWords: 12,
    // [OFFICIAL] Free: 140s / 512MB. Premium: up to 4h on web and iOS —
    // but only 10 minutes on Android, so we audit to the safer ceiling.
    video: { maxSeconds: 140, maxSecondsPremium: 600, maxSecondsPremiumWeb: 14400 },
    aspect: { preferred: [[16, 9], [1, 1], [9, 16]] },
  },

  threads: {
    label: 'Threads',
    // [OFFICIAL] Meta's Threads API: "Text posts are limited to 500
    // characters." Anything longer is rejected outright.
    maxChars: 500,
    // [OFFICIAL] The same doc says emoji count as their UTF-8 bytes, so a
    // single emoji can bill as four characters even though it looks like one.
    // Developer testing suggests the live enforcement is closer to graphemes,
    // but bytes is the number Meta publishes — and it is the stricter of the
    // two, so it is the one we audit against. Being wrong in this direction
    // costs you a few characters; being wrong the other way is a rejection
    // at send time.
    countsUtf8Bytes: true,
    // [SOFT] The feed collapses longer posts under "… more" at roughly 175
    // characters, shifting with where your line breaks fall.
    foldChars: 175,
    // [SOFT] Threads rewards short. No public dataset puts a number on it,
    // so this drives a tip and nothing stronger.
    idealMin: 80,
    idealMax: 300,

    // ── Topic tags, not hashtags ─────────────────────────────────────────
    // [OFFICIAL] Threads has no hashtags. It has ONE topic tag per post:
    // @threads, Dec 2023 — "You can only tag one topic per post, so select a
    // topic that best represents what you're saying." Extra #hashtags are
    // not rejected, they simply do not link or classify — and Threads hides
    // Instagram-style hashtag blocks on cross-posts entirely.
    hashtags: { min: 0, max: 1, hardMax: 1 },
    // [OFFICIAL] Upload-Post's threads_topic_tag: 1–50 characters, no
    // periods or ampersands. Spaces are allowed, unlike a hashtag.
    topicTag: { maxChars: 50, forbidden: ['.', '&'] },
    // Flag surplus tags rather than blocking: the post still publishes.
    hashtagsBeyondCapAreIgnored: true,
    emoji: { max: 4 },

    // [OFFICIAL] Five links per post, enforced from 22 Dec 2025. Links are
    // clickable here — unlike Instagram and TikTok.
    links: { max: 5 },
    // [OFFICIAL] Carousels take 2–20 items, images and video mixed.
    // Past about 10 people stop swiping, so that is the advised ceiling.
    carousel: { min: 2, max: 10, hardMax: 20 },
    // [OFFICIAL] No draft in the API, and none in the Threads app either.
    draft: { supported: false, reason: 'Threads has no draft — in the API or the app.' },
    // [OFFICIAL] Upload-Post lists Threads comments as partial: you can read
    // and reply, but deleting returns platform_not_supported.
    comments: { supported: true, partial: true, canDelete: false, moderation: [] },
    video: {
      // [OFFICIAL] 300 seconds, 1 GB, 23–60 FPS.
      maxSeconds: 300,
      maxBytes: 1024 * 1024 * 1024,
      // [SOFT] Same logic as every other feed: completion drives reach.
      idealMaxSeconds: 90,
    },
    image: {
      // [OFFICIAL] 8 MB, 320–1440px wide, JPEG or PNG. No GIF at all.
      formats: ['jpeg', 'png'],
      animatesGif: false,
      maxBytes: 8 * 1024 * 1024,
      minWidth: 320,
      maxWidth: 1440,
    },
    // [OFFICIAL] 0.01:1 to 10:1 accepted, 9:16 recommended — so almost
    // nothing is rejected, but portrait is what the feed is built for.
    aspect: { tolerated: [[9, 16], [4, 5], [1, 1], [16, 9]] },
    // [OFFICIAL] 250 published posts per profile per 24 hours. A carousel
    // counts as one.
    rateLimitPerDay: 250,
  },

  instagram: {
    label: 'Instagram',
    // [OFFICIAL] 2,200 including hashtags and the # symbols themselves.
    maxChars: 2200,
    // [OFFICIAL] Only the first ~125 characters show before "… more".
    foldChars: 125,
    idealMin: 100,
    idealMax: 800,
    // [OFFICIAL] Announced by Mosseri and @Creators on 18 Dec 2025 and rolled
    // out within a week: a HARD platform cap of 5 hashtags per post or Reel,
    // down from 30. Instagram's wording: "using fewer (up to 5) more targeted
    // hashtags, rather than many generic ones, can improve both your
    // content's performance and people's experience on Instagram."
    hashtags: { min: 3, max: 5, hardMax: 5 },
    // [OFFICIAL] The app allows 20, but Meta's Content Publishing API — which
    // is what any scheduling tool uses — is capped at 10. Longer carousels
    // have to be posted by hand.
    carousel: { min: 2, max: 10, hardMax: 10 },
    // Meta's own Content Publishing API says "JPEG is the only image format
    // supported" — but we publish through Upload-Post, which accepts PNG and
    // GIF for Instagram and converts them. Upload-Post is the layer that
    // actually binds, so that is what we audit against. What no amount of
    // converting fixes is animation: Instagram has no animated GIF in feed,
    // so a GIF lands as a still frame. That is a warning, not a blocker.
    image: { formats: ['jpeg', 'png', 'gif'], animatesGif: false, maxBytes: 8 * 1024 * 1024 },
    carouselApiCapBelowApp: 20,
    // [OFFICIAL] The Content Publishing API publishes; there is no draft state.
    draft: { supported: false, reason: 'Instagram has no draft state over the API.' },
    comments: { supported: true },
    hashtagCapIsPlatformEnforced: true,
    emoji: { max: 10 },
    // [OFFICIAL] URLs in captions are plain text — not clickable.
    linksAreNotClickable: true,
    video: {
      // [OFFICIAL] Messy: the in-app Reels camera caps at 3 min; camera-roll
      // uploads reached ~15 min through 2025; a 20-min ceiling is on limited
      // rollout to select accounts. We audit to 15 min so we don't wave
      // through something the account cannot actually post.
      maxSeconds: 900,
      cameraMaxSeconds: 180,
      // [OFFICIAL] Instagram states Reels over 3 minutes are not recommended
      // to non-followers — i.e. past this, reach is your existing audience.
      reachCliffSeconds: 180,
      idealMaxSeconds: 180,
    },
    aspect: { required: [[9, 16]], tolerated: [[4, 5], [1, 1]] },
    resolution: { width: 1080, height: 1920 },
  },

  tiktok: {
    label: 'TikTok',
    // [OFFICIAL] TikTok's Content Posting API states: "The maximum length is
    // 2200 in UTF-16 runes." The TikTok app itself allows 4,000 — but we
    // publish through the API, so 2,200 is the limit that actually binds.
    // Getting this wrong means a post that looks fine in the editor and is
    // rejected on send.
    maxChars: 2200,
    // [OFFICIAL] Photo posts take up to 35 images.
    carousel: { min: 2, max: 35, hardMax: 35 },
    // [OFFICIAL] TikTok's photo-post API takes JPEG and WebP only. PNG is
    // rejected — which catches people out, because PNG is what most tools
    // export by default. No GIF either.
    image: { formats: ['jpeg', 'webp'], animatesGif: false, maxBytes: 20 * 1024 * 1024 },
    // [OFFICIAL] post_mode=MEDIA_UPLOAD lands in your TikTok drafts, where you
    // can edit and tag before publishing. A real draft.
    draft: { supported: true, kind: 'draft', note: 'Lands in your TikTok inbox as a draft.' },
    // TikTok is the only one that also supports hide / pin / like.
    comments: { supported: true, moderation: ['hide', 'unhide', 'pin', 'unpin', 'like'] },
    appCaptionLimit: 4000,
    apiLimitDiffersFromApp: true,
    // [SOFT] Roughly what shows over the video before "more".
    foldChars: 100,
    // [SOFT] TikTok captions do their work fast; long ones are rarely read.
    idealMin: 50,
    idealMax: 300,
    // [OFFICIAL] TikTok's Aug 2025 change: only the first 5 hashtags count
    // toward categorisation and distribution. Unlike Instagram this is not a
    // hard rejection — you can type more, they simply do nothing — so it is
    // a warning here, not a blocker.
    hashtags: { min: 3, max: 5, hardMax: 30 },
    hashtagsBeyondCapAreIgnored: true,
    emoji: { max: 8 },
    // [OFFICIAL] Caption links are not clickable.
    linksAreNotClickable: true,
    video: {
      // [OFFICIAL] 10 minutes recorded in-app, up to 60 minutes uploaded.
      maxSeconds: 3600,
      inAppRecordMaxSeconds: 600,
      // [STUDY] Socialinsider 2026, 6M+ brand videos: engagement rate peaks
      // at 6.00% for 15–30s, and 21–34s is the commonly cited sweet spot.
      idealMinSeconds: 15,
      idealMaxSeconds: 34,
      // [STUDY] Same data, pointing the other way: 120–180s videos take a
      // median 11,136 views against 1,000 for 15–30s. Short wins engagement
      // rate; long wins raw views. Which you want is a strategy call, so we
      // flag the tradeoff rather than pretending there is one right answer.
      viewsFavourSeconds: 120,
    },
    aspect: { required: [[9, 16]], tolerated: [[1, 1], [16, 9]] },
    resolution: { width: 1080, height: 1920 },
  },

  youtube: {
    label: 'YouTube Shorts',
    // [OFFICIAL] Hard limit; YouTube rejects longer titles.
    titleMaxChars: 100,
    // [SOFT] ~40 characters show in the Shorts feed itself. Worth noting the
    // title does more work OUTSIDE the feed — channel page, search and
    // suggested — where it is fully visible.
    titleVisibleChars: 40,
    titleIdealMax: 70,
    maxChars: 5000, // description
    foldChars: 150, // first ~3 lines
    hashtags: { min: 0, max: 3, hardMax: 15 },
    emoji: { max: 4 },
    video: {
      // [OFFICIAL] Since 15 Oct 2024, anything square-or-taller running 3
      // minutes or less is classified as a Short automatically.
      maxSeconds: 180,
      // [STUDY] 50–60% of viewers who drop off do so in the first 3 seconds,
      // so shorter Shorts hold completion rate — the main ranking signal.
      idealMaxSeconds: 60,
    },
    aspect: { required: [[9, 16]], tolerated: [[1, 1], [4, 5]] },
    resolution: { width: 1080, height: 1920 },
    // [OFFICIAL] Classification is automatic, so the tag only eats title space.
    // [OFFICIAL] YouTube has no draft for an uploaded video, but an unlisted
    // upload is the working equivalent: it exists on your channel, you edit and
    // tag it, then flip it to public.
    draft: { supported: true, kind: 'unlisted', note: 'Uploads as unlisted — edit it on YouTube, then set it public.' },
    comments: { supported: true },
    shortsTagUnnecessary: true,

    // A regular upload, when you deliberately do NOT want a Short. YouTube
    // decides by length and shape, so this is really about which set of rules
    // the audit should hold you to.
    longForm: {
      label: 'YouTube video',
      // [OFFICIAL] 12 hours / 256GB for a verified account.
      maxSeconds: 43200,
      // [SOFT] Landscape is the norm outside the Shorts feed.
      aspect: { preferred: [[16, 9]], tolerated: [[1, 1], [4, 5], [9, 16]] },
      resolution: { width: 1920, height: 1080 },
      // [OFFICIAL] Custom thumbnails work on regular videos but not Shorts.
      thumbnailSupported: true,
    },
  },
};

export const BAIT_PHRASES = [
  'like and share', 'smash that like', 'double tap if', 'tag a friend who',
  'comment below if you agree', 'follow for more', 'link in bio 👇👇',
  'who else', 'am i right', 'drop a 🔥',
];

export const AI_TELLS = [
  "i'd be happy to", 'certainly!', 'great question', 'i hope this finds you well',
  "don't hesitate to reach out", 'in today’s fast-paced', "in today's fast-paced",
  'delve into', 'it is important to note', 'game-changer', 'leverage the power',
  'unlock the potential', 'navigate the landscape', 'in conclusion',
];

export const CORPORATE_SPEAK = [
  'synergize', 'circle back', 'take this offline', 'per my last email',
  'boil the ocean', 'move the needle', 'low-hanging fruit', 'touch base',
];

/**
 * [STUDY/SOFT] Posting windows, in the account's local timezone.
 *
 * Keep this in proportion: 2026 analyses put posting time at roughly a
 * 10–20% variable, not a decisive one — a good post at a mediocre hour beats
 * a mediocre post at the perfect hour. What timing genuinely affects is the
 * first 30–60 minutes of engagement, which every feed-ranking model reads as
 * its verdict on whether to amplify. Publishing while your audience sleeps
 * starves that signal.
 *
 * Sources: Buffer (9.6M Instagram posts, Sep 2026); Sprout Social and
 * Emplifi 2026 benchmarks. These are population averages — your own
 * analytics beat them every time.
 */
export const BEST_TIMES = {
  linkedin: { days: [2, 3, 4], hours: [[11, 17]], note: 'Tue–Thu, 11am–5pm.' },
  x: { days: [1, 2, 3, 4, 5], hours: [[9, 12], [17, 19]], note: 'Weekdays, late morning and early evening.' },
  // [STUDY] Buffer, 2.5M Threads posts: weekday mornings 6–11am carry the
  // highest median engagement, peaking Thursday 9am. Evenings and Saturday
  // are the weakest slots — the opposite shape to Instagram.
  threads: { days: [2, 3, 4], hours: [[6, 11]], note: 'Weekday mornings 6–11am; Thursday 9am is the peak.' },
  instagram: { days: [1, 2, 3, 4, 6], hours: [[11, 14], [18, 23]], note: 'Wed and Thu are strongest; evenings 6–11pm win most days.' },
  tiktok: { days: [2, 3, 4], hours: [[14, 18], [18, 23]], note: 'Tue–Thu 2–6pm is strongest; evenings 6–11pm also perform.' },
  youtube: { days: [4, 5, 6], hours: [[12, 15], [17, 20]], note: 'Thu–Sat, afternoon into early evening.' },
};
