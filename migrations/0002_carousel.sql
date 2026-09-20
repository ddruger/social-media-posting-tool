-- Multi-image / carousel support.
--
-- posts.media_key held exactly one file. media_items holds an ordered list of
-- {key, kind, meta} instead, so a post can carry a carousel. media_key stays
-- for older rows and for the single-video case, and is treated as item one
-- when media_items is empty.

ALTER TABLE posts ADD COLUMN media_items TEXT NOT NULL DEFAULT '[]';
