-- Per-platform media. Empty means "use the post's shared media", so existing
-- posts keep working untouched and the override is genuinely optional.
ALTER TABLE variants ADD COLUMN media_items TEXT NOT NULL DEFAULT '[]';
