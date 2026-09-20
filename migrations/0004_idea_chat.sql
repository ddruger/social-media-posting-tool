-- The idea builder: a conversation that sharpens a rough thought into a post.
-- Kept on the post so you can reopen it and see how you got there.
ALTER TABLE posts ADD COLUMN idea_chat TEXT NOT NULL DEFAULT '[]';
