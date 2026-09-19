-- Social Studio database schema. Safe to re-run: everything is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS posts (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL DEFAULT '',   -- internal label, e.g. "ADSN ep 42 clip"
  master_caption TEXT NOT NULL DEFAULT '',   -- the one thing you write
  link_url       TEXT NOT NULL DEFAULT '',
  media_key      TEXT,                        -- R2 object key
  media_kind     TEXT NOT NULL DEFAULT 'none',-- none | video | image
  media_meta     TEXT NOT NULL DEFAULT '{}',  -- JSON: {durationSec,width,height,bytes,mime,name}
  status         TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | published | partial | failed | cancelled
  scheduled_at   TEXT,                        -- ISO-8601 UTC
  timezone       TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(scheduled_at);

-- One row per platform per post. This is what kills the copy-paste work:
-- four platform-native versions generated from one master caption.
CREATE TABLE IF NOT EXISTS variants (
  post_id       TEXT NOT NULL,
  platform      TEXT NOT NULL,               -- linkedin | x | instagram | youtube
  enabled       INTEGER NOT NULL DEFAULT 1,
  body          TEXT NOT NULL DEFAULT '',    -- caption / commentary / description
  headline      TEXT NOT NULL DEFAULT '',    -- YouTube title (unused elsewhere)
  first_comment TEXT NOT NULL DEFAULT '',    -- e.g. the link, kept out of the LinkedIn body
  hashtags      TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings, no "#"
  options       TEXT NOT NULL DEFAULT '{}',  -- JSON, platform-specific knobs
  offset_min    INTEGER NOT NULL DEFAULT 0,  -- stagger: minutes after the post's scheduled time
  PRIMARY KEY (post_id, platform)
);

-- One row per Upload-Post API call. A call can cover several platforms that
-- share the same send time.
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL,
  platforms   TEXT NOT NULL DEFAULT '[]',    -- JSON array
  job_id      TEXT,                          -- Upload-Post scheduled job id
  request_id  TEXT,                          -- Upload-Post async request id
  send_at     TEXT,                          -- ISO-8601 UTC
  state       TEXT NOT NULL DEFAULT 'pending', -- pending | scheduled | published | failed | cancelled
  results     TEXT NOT NULL DEFAULT '{}',    -- JSON: per-platform {success,url,post_id,error}
  error       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_post  ON jobs(post_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);

-- The most recent audit for each platform, so the dashboard can show scores
-- without re-running everything.
CREATE TABLE IF NOT EXISTS audits (
  post_id    TEXT NOT NULL,
  platform   TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  blockers   INTEGER NOT NULL DEFAULT 0,
  report     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, platform)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
