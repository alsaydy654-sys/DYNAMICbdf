/*
# Create textbook_pages table + storage bucket (single-tenant, no auth)

Single-tenant app (no sign-in). Policies allow anon + authenticated full CRUD
(intentionally shared data).

Columns match DEFAULT_CONFIG.columns in the app.
*/

CREATE TABLE IF NOT EXISTS textbook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  page_number integer NOT NULL,
  grade text,
  term text,
  original_pdf_name text,
  book_title text,
  mime_type text,
  file_size bigint,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS textbook_pages_grade_term_idx ON textbook_pages (grade, term);
CREATE INDEX IF NOT EXISTS textbook_pages_page_number_idx ON textbook_pages (page_number);

ALTER TABLE textbook_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_textbook_pages" ON textbook_pages;
CREATE POLICY "anon_select_textbook_pages" ON textbook_pages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_textbook_pages" ON textbook_pages;
CREATE POLICY "anon_insert_textbook_pages" ON textbook_pages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_textbook_pages" ON textbook_pages;
CREATE POLICY "anon_update_textbook_pages" ON textbook_pages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_textbook_pages" ON textbook_pages;
CREATE POLICY "anon_delete_textbook_pages" ON textbook_pages FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public)
SELECT 'textbooks', 'textbooks', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'textbooks');

DROP POLICY IF EXISTS "anon_read_textbook_objects" ON storage.objects;
CREATE POLICY "anon_read_textbook_objects" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'textbooks');

DROP POLICY IF EXISTS "anon_insert_textbook_objects" ON storage.objects;
CREATE POLICY "anon_insert_textbook_objects" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'textbooks');

DROP POLICY IF EXISTS "anon_update_textbook_objects" ON storage.objects;
CREATE POLICY "anon_update_textbook_objects" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'textbooks') WITH CHECK (bucket_id = 'textbooks');

DROP POLICY IF EXISTS "anon_delete_textbook_objects" ON storage.objects;
CREATE POLICY "anon_delete_textbook_objects" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'textbooks');
