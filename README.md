# Social Studio

**Write once, audit against each platform's best practices, schedule everywhere.**

Posts to LinkedIn, X, Instagram, TikTok and YouTube Shorts. Runs on Cloudflare's
free tier. Setup takes about 20 minutes and is written for non-developers —
every step is a command to copy and paste.

---

Write the caption once. Get five platform-native versions. Audit them against
each platform's current best practices. Schedule them all in one click.

Replaces: uploading the same video five times, rewriting the caption five
times, and scheduling natively in five different apps.

Covers LinkedIn, X, Instagram, TikTok and YouTube Shorts.

---

## What it actually does

**1. You write one caption.** However you'd say it, hashtags at the end, link
wherever. One box.

**2. It builds five drafts.** Not copies — different shapes:

| | What it does differently |
|---|---|
| **LinkedIn** | Breaks the wall of text into short paragraphs and puts a line break after the hook, so the first 140 characters land on their own (that's the mobile "…see more" fold). Targets the 1,300–2,500 character band. 3–5 hashtags, which is LinkedIn's own recommendation. |
| **X** | Cuts to the sharpest idea that fits in 280, counting every link as 23 characters like X does. Drops to 0–2 hashtags. Offers to split into a thread instead. |
| **Instagram** | Strips the URL (it isn't clickable there) and swaps in "Link in bio". Caps hashtags at 5 — Instagram made that a hard platform limit in December 2025. |
| **TikTok** | Keeps it short and breaks after the hook. Holds you to **2,200 characters — the API limit, not the 4,000 the app shows you** — because that is what actually binds when posting through a tool. Strips the URL (not clickable) and caps at 5 hashtags. |
| **YouTube Shorts** | Pulls a title out of your opening line and keeps the hook inside the ~40 characters that show in the feed. Strips `#Shorts`, which stopped being necessary in October 2024. |

**3. It audits every one before it goes out.** Each platform gets a score out
of 100 and a list of findings at three levels:

- 🔴 **Blocker** — will be rejected or will clearly flop. Scheduling is held
  until you fix it or explicitly override.
- 🟡 **Warning** — allowed, but you're leaving reach on the table.
- ⚪ **Tip** — a judgement call worth a look.

Plus the checks that passed, so you can see what was actually verified.

Some findings come with a **one-click fix**: *Replace with "link in bio"*,
*Remove #Shorts from title*, *Split into a thread*, and moving a link between
the post body and the first comment in either direction.

It checks your video too — duration, aspect ratio, resolution — so you find out
a landscape clip can't be a Short *before* you schedule it, not after.

**4. It schedules everywhere at once.** One button, all five. Posts are handed to
Upload-Post with a send time, so **they fire from their servers** — your laptop
does not need to be on.

---

## Try it before you set anything up

You can run the whole thing locally with **no accounts and no API keys** — see
[Testing locally first](#testing-locally-first) at the bottom. Six commands,
about five minutes, and you get the real drafts and the real audit. Only
publishing needs the setup below.

## Setup

One-time, about 20 minutes. You'll need a terminal (on a Mac: press `⌘+Space`,
type "Terminal", hit enter). Copy-paste each command and press enter.

### Step 1 — Accounts you need

| Service | What for | Cost |
|---|---|---|
| [Cloudflare](https://dash.cloudflare.com/sign-up) | Hosts the tool | Free |
| [Upload-Post](https://upload-post.com) | Does the actual posting | Free for 10 posts/month, $24/mo unlimited |
| [Anthropic](https://console.anthropic.com) | *Optional* — the "Rewrite with AI" button | Pay per use, cents per rewrite |

You only need Anthropic if you want the AI rewrite. Everything else — the five
drafts, the audit, the scheduling — works without it.

> **On the free Upload-Post plan:** one API call counts as one upload, and
> posting to all five platforms at the same time is **one call**. So 10 posts a
> month means 10 rounds of all-five. If you set different send times per
> platform (the "stagger" field), each distinct time is a separate call — five
> staggered platforms burns five of your ten.

### Step 2 — Install the tools

```bash
git clone https://github.com/ddruger/social-media-posting-tool.git
cd social-media-posting-tool
npm install
npx wrangler login
```

That last one opens your browser to connect your Cloudflare account. Click allow.

### Step 3 — Create the database and file storage

```bash
npm run db:create
```

This prints a block of text. Find the line that looks like:

```
database_id = "a1b2c3d4-...."
```

Copy that ID. Open `wrangler.toml` in this folder, find the line that says
`PASTE_THE_DATABASE_ID_FROM_npm_run_db_create_HERE`, and replace that
placeholder with your ID (keep the quotes). Save the file.

Then:

```bash
npm run bucket:create
npm run db:migrate
```

### Step 4 — Set your passwords and keys

Each of these asks you to paste a value, then press enter. Nothing is stored in
the code — Cloudflare keeps them encrypted.

```bash
npx wrangler secret put APP_PASSWORD
```
→ Make up a long password. This is what you'll use to sign in.

```bash
npx wrangler secret put UPLOADPOST_API_KEY
```
→ From upload-post.com → Settings → API Key.

```bash
npx wrangler secret put UPLOADPOST_USER
```
→ A profile name, e.g. `daniel`. Lowercase, no spaces.

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```
→ Optional. Skip this one if you don't want the AI rewrite button.

### Step 5 — Deploy

```bash
npm run deploy
```

It prints a URL like `https://social-studio.yourname.workers.dev`.

**One more thing:** open `wrangler.toml`, paste that URL into the empty
`PUBLIC_BASE_URL = ""` line, save, and run `npm run deploy` once more. This is
how Upload-Post knows where to fetch your videos from — scheduling video posts
will fail without it.

### Step 6 — Connect your social accounts

**You do not need developer accounts or API keys for any of the five
platforms.** Upload-Post's apps are already verified and audited with each
platform, so connecting is just an ordinary "log in and approve" flow — the
same as connecting any app to your accounts.

#### 6a. Create the profile

In the Upload-Post dashboard, go to **User Management** and create a profile.

> **The profile name must exactly match what you set as `UPLOADPOST_USER` in
> Step 4.** If you used `daniel` there, name the profile `daniel`. A mismatch
> is the single most common reason posts fail with a confusing error.

#### 6b. Connect each platform

In the dashboard, find each network and press **Connect**. The platform's own
login window opens, you approve the permissions, done. Nothing to configure
first.

(The **Connect accounts** button in Social Studio opens the same flow. Either
route works — the dashboard is easier the first time because you can see the
connection status of all five at once.)

#### Prerequisites, per platform

Only Instagram has a real prerequisite. Sort it out before you start or you
will get stuck mid-flow.

| Platform | What you need first |
|---|---|
| **Instagram** | A **Business or Creator** account — personal accounts cannot be posted to by any tool, and that's Meta's rule. Switch in the Instagram app: Settings → Account type. It must also be **email/phone verified**, and you must approve **every** permission in the OAuth screen. A 400 error on connect means one of those three. |
| **LinkedIn** | Nothing. Posts to your personal profile, or a company page if you'd rather. |
| **X** | Nothing. |
| **TikTok** | Nothing. Posts go out public by default. |
| **YouTube** | Nothing. It will ask for permission to upload videos — that's expected. Note custom thumbnails aren't supported on Shorts (YouTube's limitation), so the tool doesn't offer one. |

#### Connections expire — this is the thing that will bite you later

Tokens do not last forever, and an expired one means a scheduled post quietly
fails to go out:

| Platform | Roughly how long | Also expires when |
|---|---|---|
| LinkedIn | ~60 days | you change your LinkedIn password |
| TikTok | ~60 days (auto-renews with regular use) | |
| Instagram | varies | you change your Facebook password |
| YouTube | ~6 months | |
| X | rarely expires | |

If something stops posting, reconnect it under **Manage Users** in the
Upload-Post dashboard before assuming the tool is broken. Social Studio's
**Refresh status** button will show you the failure.

#### Daily limits, per connected account

These are the platforms' own caps, not Upload-Post's. You are nowhere near
them at a normal posting cadence, but for reference:

| Instagram | TikTok | YouTube | LinkedIn | X |
|---|---|---|---|---|
| 50/day | 15/day | 30/day | 150/day | 50/day |

Done. Bookmark the URL.

---

## Using it

1. **+ New post**
2. Write your caption in the big box. Drop your video on the dropzone.
3. Set a send time.
4. Read the audit. Fix what's flagged (or click the fix buttons).
5. **Audit & schedule all**

The left sidebar shows everything scheduled, published, or still in draft.
**Refresh status** asks Upload-Post what actually happened; it also runs
automatically every 10 minutes.

To pull something back, open it and hit **Cancel scheduled posts**.

### Handy to know

- **Stagger** — minutes after your send time, per platform. Set LinkedIn to 0
  and X to 30 to avoid posting the identical thing everywhere at the same
  minute. Remember it costs an extra upload on the free plan.
- **Rebuild from caption** — regenerates a draft. It overwrites your edits to
  that platform, so it'll ask nothing — be deliberate.
- **X Premium** — if you have it, tick it in Settings and the audit stops
  holding you to 280 characters.

---

## Where these rules come from

Every number is tagged in `src/rules.js` with its source:

- **`[OFFICIAL]`** — the platform said it themselves
- **`[STUDY]`** — measured research, with the sample size noted
- **`[SOFT]`** — practitioner consensus with no hard dataset behind it

`[SOFT]` numbers only ever produce tips, never blockers. The blockers are all
things that will actually be rejected or actually cap your reach.

The main ones, verified 19 September 2026:

| Rule | Source |
|---|---|
| LinkedIn 3,000 chars; fold at ~140 mobile / ~210 desktop | LinkedIn |
| LinkedIn best length 1,300–2,500 chars | AuthoredUp — 372,126 posts, Sep 2025–Feb 2026 |
| LinkedIn 3–5 hashtags | LinkedIn's own guidance |
| LinkedIn body link costs ~18.8% of reach | Van der Blom *Algorithm Insights* 2026 — 1.3M posts, 50k creators |
| Instagram hard cap of 5 hashtags | Instagram — Mosseri / @Creators, 18 Dec 2025 |
| Instagram Reels over 3 min not recommended to non-followers | Instagram |
| YouTube Shorts = square-or-taller and ≤3 min | YouTube, since 15 Oct 2024 |
| TikTok caption 2,200 via API (4,000 in the app) | TikTok Content Posting API docs |
| TikTok registers only the first 5 hashtags | TikTok, Aug 2025 |
| TikTok engagement peaks at 15–34s; 120s+ favours views | Socialinsider 2026 — 6M+ brand videos |
| TikTok best times Tue–Thu 2–6pm | Sprout Social 2026 — ~2B engagements, 307k profiles |
| X 280 / 25,000 Premium; every link bills 23 chars | X |
| X 1–2 hashtags ≈ +21% engagement; 5+ ≈ −17% reach | 2026 engagement analyses |
| X video 140s free; Premium 4h web/iOS but 10 min Android | X |
| Best posting times | Buffer (9.6M Instagram posts), Sprout Social, Emplifi 2026 |

### Three things worth knowing

**The LinkedIn "link in the first comment" trick is no longer a clean win.**
This tool used to do it automatically. It doesn't any more. The 2026 data
shows a link in the post body costs about 18.8% of median reach — real, but
modest — while LinkedIn now suppresses comments *containing* links by up to
80% and detects posts written to funnel people into their own first comment.
So the workaround trades a known, modest cost for an unreliable one and hides
your link. The tool now leaves the link in the post and explains the tradeoff,
with a one-click button if you want to move it anyway. Contrary evidence
exists too: a separate Q1 2026 analysis of ~400,000 posts found posts with
several external links *out-performed* posts with none.

**TikTok's caption limit is 2,200 here, not the 4,000 you see in the app.**
TikTok's Content Posting API caps titles at 2,200 UTF-16 runes, and everything
scheduled through a tool goes via that API. Write 3,000 characters in the
TikTok app and it's fine; schedule the same thing here and it would be
rejected on send. The audit blocks it rather than letting you find out later.
The hashtag situation differs from Instagram too — Instagram *rejects* a sixth
hashtag, whereas TikTok accepts it and simply ignores everything past the
fifth, so that one is a warning rather than a blocker.

**Posting time is worth about 10–20%, not more.** A good post at an average
hour beats an average post at the perfect hour. What timing genuinely affects
is the first 30–60 minutes of engagement, which is what ranking keys off — so
the real mistake is posting while your audience is asleep, not missing a
window by an hour. Your own analytics beat these population averages.

## Keeping the rules current

When something changes, edit the number in `src/rules.js` and run
`npm run deploy`. You do not need to touch any other file.

Rules were last reviewed **19 September 2026**. Worth a re-check every few
months — Instagram's hashtag cap went from 30 to 5 with about a week's notice.

---

## If something breaks

| What you see | What it means |
|---|---|
| "Invalid API key" | `UPLOADPOST_API_KEY` is wrong. Re-run the `wrangler secret put` command for it. |
| "A video was selected but it has no public URL yet" | You skipped the second deploy in Step 5. Put your URL in `PUBLIC_BASE_URL` and deploy again. |
| "That file is 120 MB. The limit is 95 MB" | Cloudflare caps uploads at about 100 MB. Export the video smaller — a 1080×1920 Short should be well under 50 MB. |
| Instagram post fails | Almost always a personal rather than Business/Creator account, or an unverified account. Check Facebook Account Quality, then reconnect in Step 6. |
| A platform silently stops posting | Its connection expired — see the token table in Step 6. Reconnect under **Manage Users** in the Upload-Post dashboard. |
| "Session expired" | Same thing: reconnect that platform in the Upload-Post dashboard. |
| Error mentioning the `user` parameter | Your `UPLOADPOST_USER` doesn't match the profile name in Upload-Post's User Management. They must be identical. |
| "Video URL not accessible" | Upload-Post can't fetch your video. Usually `PUBLIC_BASE_URL` is empty or wrong — see Step 5. Test by opening `your-url/m/<the file id>` in a private browser window. |
| "Not signed in" | Your 30-day Social Studio session expired. Sign in again. |

Live logs, if you need them:

```bash
npm run logs
```

### Testing locally first

You do **not** need any accounts for this — no Cloudflare login, no
Upload-Post key, nothing. Everything except actually publishing runs on your
own machine. Needs [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/ddruger/social-media-posting-tool.git
cd social-media-posting-tool
npm install
echo 'APP_PASSWORD="pick-anything"' > .dev.vars
npx wrangler d1 execute social-studio --local --file=./schema.sql
npm run dev
```

Open `http://localhost:8787` and sign in with whatever you put as the
password. You get the real thing: paste a caption, watch the five drafts
build, see the audit score them live, click the fixes.

What works with no keys: the five drafts, the full audit, scoring, one-click
fixes, saving posts. What doesn't: **Connect accounts**, **Audit & schedule**
and **Rewrite with AI** — those need keys and will say so plainly rather than
failing oddly. Media upload works locally but the file is stored on your own
machine, which is fine for checking the video duration and aspect-ratio checks.

It uses a separate local database, so nothing here touches a deployed copy.


---

## How it's put together

```
src/
  rules.js        Every best-practice number, with sources. Edit this one.
  audit.js        The checks. Scores, findings, one-click fixes.
  compose.js      Turns one caption into five platform-native drafts.
  ai.js           The optional "rewrite in your voice" button.
  uploadpost.js   Talks to Upload-Post. Verified against their OpenAPI spec.
  db.js           Database helpers.
  auth.js         Password → signed cookie.
  index.js        Routing, scheduling, the every-10-minutes status check.
  ui.html         The whole interface, one file.
schema.sql        Database tables.
```

Runs on Cloudflare Workers with D1 (database) and R2 (video storage). All three
have free tiers that comfortably cover personal use.

**A note on your videos:** they're stored at
`your-url/m/<random-id>`, publicly readable, because Upload-Post has to fetch
them. The ID is a random UUID so the link is unguessable, but it is not
password-protected — that's the tradeoff that lets the platforms pull the file.
Deleting a post deletes its video.
