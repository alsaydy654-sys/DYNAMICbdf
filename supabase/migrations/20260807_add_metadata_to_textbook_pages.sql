ALTER TABLE textbook_pages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_textbook_pages_metadata_part ON textbook_pages ((metadata->>'part'));
