-- Counts the saves that changed the title or the body of a page, so an editor
-- can tell whether someone else saved in the meantime (moving a page in the
-- tree does not count, unlike updatedAt).
ALTER TABLE "NotebookPage" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
