-- "Send as drafts" — deliver unpublished where the platform allows it, so you
-- can go in and tag people before it goes live.
ALTER TABLE posts ADD COLUMN draft_mode INTEGER NOT NULL DEFAULT 0;
