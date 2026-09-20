# Social Studio

**Write once, audit against each platform's best practices, schedule everywhere.**

Write the caption once. Get five platform-native versions — LinkedIn, X,
Instagram, TikTok and YouTube Shorts. Each one audited against that platform's
current rules before it goes out. Then schedule all five in one click.

Replaces uploading the same video five times, rewriting the caption five times,
and scheduling natively in five different apps.

## Install it

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ddruger/social-media-posting-tool)

**↑ Click that.** Cloudflare copies this code to your own GitHub, builds it,
creates its database and video storage, and gives you a web address to log
into. No terminal, nothing to install, about five minutes.

It asks you for a few things along the way — see
[Setup](#setup) for exactly what and where to get it.

Runs free: Cloudflare's free tier covers it, and the posting service has a free
plan.

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

## Setup

### First — what the two accounts are for

This tool needs two services behind it. Neither is optional, and it's worth
knowing what each one does before you sign up.

**Cloudflare — where the tool itself lives.**
Social Studio is a small web app, and Cloudflare hosts it. This is where your
posts, captions and videos are stored while they wait to go out. Free tier
covers everything here comfortably. You already have an account.

**Upload-Post — the thing that actually posts.**
[Upload-Post](https://upload-post.com) has already registered as a developer
with all five platforms and passed the reviews each one requires. You connect
your accounts to them once, and they hand this tool a single key that posts
everywhere. Free for 10 posts a month, $24/month unlimited.

### Why not just talk to each platform's API directly?

Reasonable question, and the answer is more nuanced than "you can't." Posting
to **your own** accounts is much easier than posting on behalf of other
people — most of the scary review processes only apply to the latter. Checked
September 2026:

| Platform | Direct integration, your own account | Catch |
|---|---|---|
| **LinkedIn** | Genuinely easy | Add the "Share on LinkedIn" product to a developer app. Self-serve, no review, works the same day. ~100 posts/day. |
| **Instagram** | Genuinely easy | A Meta app in Development mode with your own account added as an Instagram Tester. **No App Review at all.** Review is only needed when other people connect. |
| **X** | Works, costs pennies | The free tier closed to new developers in Feb 2026. Now pay-per-use: $0.015 a post, **$0.20 if it contains a link**. At a normal cadence that's a few dollars a month, but it needs a card on file. |
| **YouTube** | Works, with a recurring annoyance | While your Google Cloud app is in "Testing", **refresh tokens die every 7 days** — you would re-authorise weekly forever. Fixing that means publishing the app to Production, and video upload is a sensitive scope, so that needs Google verification. |
| **TikTok** | **Blocked** | The Content Posting API requires an audit: 2–4 weeks and several rounds of feedback. Until it passes, every post is forced to SELF_ONLY *and your account has to be private*. There is no personal-use exemption. |

So three of the five are very doable, YouTube is doable but nags, and TikTok is
a genuine wall.

The stronger argument for Upload-Post isn't approvals — it's the media
plumbing. Each platform uploads video completely differently: LinkedIn
registers then uploads then creates, Instagram builds a container and you poll
it until it's ready, YouTube wants a resumable upload, X wants chunked upload.
That's five protocols, five token-refresh schemes and five sets of error
handling to write and then keep working as each platform changes. One key
replaces all of it.

**If you'd rather not use a third party at all**, the honest option is to drop
TikTok and integrate the other four directly. That's real work, and it moves
the setup burden from one signup to four developer portals — but it's possible,
and nothing about this tool's design prevents it. The audit and the five drafts
are the interesting part, and they don't depend on how posting happens.

**Worth being clear about the tradeoff:** Upload-Post is a small third-party
company, and connecting your accounts gives them permission to post as you on
all five platforms. That's the same deal as any scheduling tool — Buffer,
Later, Hootsuite all work this way — but it is a real decision and you should
make it deliberately rather than because a README told you to. You can revoke
access at any time from each platform's own settings, and you can delete the
connection from their dashboard.

### Then — click the button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ddruger/social-media-posting-tool)

Cloudflare copies this repo into your own GitHub, creates the database and
media storage for you, asks for your keys on a single page, then builds and
deploys it. You get a URL to log into. No terminal, no commands, nothing to
install.

**Have these two ready before you click**, because it asks for them:

| | Where to get it |
|---|---|
| A **Cloudflare account** | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) — free |
| An **Upload-Post API key** | [upload-post.com](https://upload-post.com) → dashboard → API Keys — free for 10 posts/month |

You'll also need a GitHub account, since Cloudflare puts its copy of the code
there.

On the setup page it asks for three things:

- **`APP_PASSWORD`** — make one up. This is what you'll type to sign in.
- **`UPLOADPOST_API_KEY`** — from the table above.
- **`UPLOADPOST_USER`** — a profile name, e.g. `daniel`. Lowercase, no spaces.
  Write it down; it has to match a profile you create in the next step.

If it also asks for `PUBLIC_BASE_URL` or `DEFAULT_TIMEZONE`, leave them as they
are. Neither needs a value, and `PUBLIC_BASE_URL` can't be known until after
the deploy anyway — the Worker figures it out on its own.

**"Rewrite with AI" is off by default**, because it needs a paid Anthropic key
and nothing else does. The button is visibly disabled until you add one. To
turn it on: get a key from [console.anthropic.com](https://console.anthropic.com),
then in Cloudflare open your Worker → **Settings** → **Variables and Secrets**
→ Add → **Secret**, named `ANTHROPIC_API_KEY`.

When it finishes, Cloudflare shows your URL — something like
`https://social-studio.<your-name>.workers.dev`. Open it, sign in with the
password you chose, and bookmark it. That's your tool.

Then do [Step 6](#step-6--connect-your-social-accounts) below to connect your
five accounts. That part is unavoidably a browser job, but it's just clicking
"Connect" and approving.

> **On the free Upload-Post plan:** one API call counts as one upload, and
> posting to all five platforms at the same time is **one call**. So 10 posts a
> month means 10 rounds of all-five. If you set different send times per
> platform (the "stagger" field), each distinct time is a separate call — five
> staggered platforms burns five of your ten.

---

### The command-line way

Only if you'd rather. Needs [Node.js](https://nodejs.org) 18+ installed first
(download the **LTS** build, run the installer, then **quit Terminal with ⌘Q
and reopen it** — an already-open window won't see the new install).

```bash
git clone https://github.com/ddruger/social-media-posting-tool.git
cd social-media-posting-tool
npm run setup
```

`npm run setup` logs you into Cloudflare, creates the database and storage,
writes the config values in for you, asks for your keys, and deploys. It's
idempotent, so re-running it is safe and skips anything already done.

To run it on your own machine instead of deploying — no accounts or keys
needed at all, and you still get the full drafts and audit:

```bash
cp .dev.vars.example .dev.vars    # set APP_PASSWORD, leave the rest blank
npx wrangler d1 migrations apply DB --local
npm run dev
```

Then open `http://localhost:8787`. Publishing won't work without keys, but
everything else does.

### Step 6 — Connect your social accounts

**You do not need developer accounts or API keys for any of the five
platforms.** Upload-Post's apps are already verified and audited with each
platform, so connecting is just an ordinary "log in and approve" flow — the
same as connecting any app to your accounts.

#### 6a. Create the profile

In the Upload-Post dashboard, go to **User Management** and create a profile.

> **The profile name must exactly match what you set as `UPLOADPOST_USER` in
> setup.** If you used `daniel` there, name the profile `daniel`. A mismatch
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

### Carousels and multi-image posts

Drop in several images and the post becomes a carousel. Reorder or remove
slides in the media list; that order is the post order. Limits differ sharply
and the audit holds each platform to its own:

| | Slides | Note |
|---|---|---|
| **LinkedIn** | up to 20 | Past about 9 it reads as a dump, so that's where the warning starts. |
| **Instagram** | up to 10 | The app allows 20, but **every scheduling tool goes through Meta's API, which stops at 10.** Longer carousels have to be posted by hand. |
| **X** | up to 4 | Hard limit. |
| **TikTok** | up to 35 | Photo posts. |
| **YouTube** | — | Video only; extra files are ignored. |

Only Instagram can mix images and video in one carousel. Anywhere else that's
a blocker, not a warning.

### YouTube: Short or regular video

Each YouTube card has a **Short / Regular video** switch. It picks which rules
the audit applies — Shorts keep the 3-minute, square-or-taller limits; regular
videos get the 12-hour ceiling and landscape as the norm.

YouTube classifies by length and shape no matter what you intend, so choosing
*Regular video* for something vertical and under 3 minutes warns you it'll be
a Short anyway. Custom thumbnails work on regular videos and not on Shorts.

### X: single post or thread

The **Single post / Thread** switch rebuilds the draft for the shape you pick.
Single trims to fit 280. Thread keeps the whole argument and splits it into
numbered posts — the Preview shows the exact split.

### Drafts

A post starts as a **draft**: no send time, nothing sent, sitting in your list
until you decide. The audit still runs while you work on it, so you can shape a
post over several sittings.

**When to send** has three states:

- **Keep as draft** — parked. This is where new posts start.
- **Publish now** — goes out as soon as you press the button.
- **Schedule for later** — pick a time.

Switching back to *Keep as draft* clears the send time and parks it again.

#### Sending unpublished, so you can tag

When publishing or scheduling there's an optional **Send unpublished where the
platform allows it**. Useful because mentions that need to link — LinkedIn's
especially — have to be typed in the app.

Only two of the five can accept something unpublished, and that's a platform
limit rather than a gap here:

| | Unpublished? | What happens |
|---|---|---|
| **TikTok** | Yes | Lands in your TikTok drafts. |
| **YouTube** | Effectively | Uploads **unlisted** — YouTube has no draft for a video, but unlisted does the job. |
| **LinkedIn** | No | Drafts exist only in the app; no API can create one. |
| **X** | No | No draft for regular posts. |
| **Instagram** | No | No draft state at all. |

**The three that can't are held back, not published.** Every platform card has
a **Copy caption** button for pasting those into the app by hand.

Media is kept on anything not fully published, so a draft still has its files
when you come back to it.

### On tagging people

`@mentions` work as you'd expect on **X, Instagram, TikTok and YouTube** — type
`@handle` and it links.

**LinkedIn is the exception.** Its API needs a mention encoded as
`@[Name](urn:li:person:xxxx)` — an internal ID you can't reasonably look up. A
plain `@Daniel` publishes as text: no link, no notification. That's true of
every scheduling tool. If a LinkedIn mention matters, send that post as a draft
or copy it across and post natively.

### Previews

Every platform card has an **Edit / Preview** switch. Preview shows roughly how
the post lands — including, crucially, **where the "see more" fold cuts**, using
the same numbers the audit scores against. So if the audit says your hook is
buried, the preview shows you exactly what a reader sees before tapping.

The name and handle in previews come from Settings.

### Handy to know

- **Publish now vs Schedule** — a new post defaults to **Publish now**, which
  sends as soon as you press the button. Switch to **Schedule for later** to
  pick a time. The audit runs either way; blocking issues still stop it.
- **TikTok starts switched off.** Flip it on per post, or change which
  platforms start on in Settings.
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
| `command not found: npm` | Node.js isn't installed. You only need it for the command-line route — the [Deploy to Cloudflare button](#the-easy-way--one-button-no-terminal) needs none of it. To install: [nodejs.org](https://nodejs.org), then quit Terminal with ⌘Q and reopen. |
| `command not found: git` | macOS offers to install it: a box appears saying "command line developer tools", click **Install**, wait, then try again. |
| "Invalid API key" | `UPLOADPOST_API_KEY` is wrong. Re-run the `wrangler secret put` command for it. |
| "A video was selected but it has no public URL yet" | The post is set to video but no file finished uploading. Re-add it. |
| "That file is 120 MB. The limit is 95 MB" | Cloudflare caps uploads at about 100 MB. Export the video smaller — a 1080×1920 Short should be well under 50 MB. |
| Instagram post fails | Almost always a personal rather than Business/Creator account, or an unverified account. Check Facebook Account Quality, then reconnect in Step 6. |
| A platform silently stops posting | Its connection expired — see the token table in Step 6. Reconnect under **Manage Users** in the Upload-Post dashboard. |
| "Session expired" | Same thing: reconnect that platform in the Upload-Post dashboard. |
| Error mentioning the `user` parameter | Your `UPLOADPOST_USER` doesn't match the profile name in Upload-Post's User Management. They must be identical. |
| "Video URL not accessible" | Upload-Post can't reach your video. Test by opening `your-url/m/<the file id>` in a private browser window — it should download. If you set `PUBLIC_BASE_URL` in `wrangler.toml`, make sure it matches your actual URL; leaving it blank is fine and usually better. |
| "Not signed in" | Your 30-day Social Studio session expired. Sign in again. |

Live logs, if you need them:

```bash
npm run logs
```

### Testing locally first

You do **not** need any accounts for this — no Cloudflare login, no
Upload-Post key, nothing. Everything except actually publishing runs on your
own machine.

You do need Node.js 18+ installed first ([nodejs.org](https://nodejs.org), LTS
build). If `npm` gives you `command not found`, that's what's missing.

```bash
git clone https://github.com/ddruger/social-media-posting-tool.git
cd social-media-posting-tool
npm install
echo 'APP_PASSWORD="pick-anything"' > .dev.vars
npx wrangler d1 migrations apply DB --local
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
migrations/       Database tables, applied automatically on deploy.
```

Runs on Cloudflare Workers with D1 (database) and R2 (video storage). All three
have free tiers that comfortably cover personal use.

**A note on your videos:** they're stored at
`your-url/m/<random-id>`, publicly readable, because Upload-Post has to fetch
them. The ID is a random UUID so the link is unguessable, but it is not
password-protected — that's the tradeoff that lets the platforms pull the file.
Deleting a post deletes its video.
