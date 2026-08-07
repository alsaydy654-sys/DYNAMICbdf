-- Required for the idempotent upsert used by src/lib/sync.ts: retrying a page
-- after a network drop must update the existing row instead of duplicating it.
ALTER TABLE textbook_pages
  ADD CONSTRAINT textbook_pages_storage_path_key UNIQUE (storage_path);
