/*
# Create textbook_pages table + storage bucket (single-tenant, no auth)

## Purpose
Stores one row per processed PDF page uploaded by the textbook PDF processor app.
The app is single-tenant (no sign-in screen), so policies allow anon + authenticated
full CRUD because the data is intentionally shared/public.

## 1. New Tables
- `textbook_pages`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `file_name` (text, not null) — generated image file name, e.g. "001.jpeg"
  - `storage_path` (text, not null) — full path inside the storage bucket
  - `page_number` (int, not null) — 1-based page index in the source PDF
  - `grade` (text) — selected grade label (Arabic)
  - `term` (text) — selected term label (Arabic)
  - `original_pdf_name` (text) — name of the source PDF file
  - `book_title` (text) — free-text book title entered by the user
  - `mime_type` (text) — image mime type ("image/jpeg" or "image/png")
  - `file_size` (bigint) — size of the generated image in bytes
  - `created_at` (timestamptz, default now())

## 2. Indexes
- `textbook_pages_grade_term_idx` on (grade, term) for filtering by grade/term
- `textbook_pages_page_number_idx` on (page_number) for ordering

## 3. Storage
- Creates storage bucket `textbooks` (public-read) if it does not already exist.

## 4. Security (RLS)
- RLS enabled on `textbook_pages`.
- Four separate CRUD policies scoped to `anon, authenticated` (single-tenant,
  intentionally shared data — no ownership check).
- Storage object policies allow anon + authenticated CRUD in the `textbooks` bucket.

## 5. Notes
- Column names match the DEFAULT_CONFIG.columns mapping in the app.
- All policies are idempotent (DROP POLICY IF EXISTS before CREATE).
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

CREATE INDEX IF NOT EXISTS textbook_pages_grade_term_idx
  ON textbook_pages (grade, term);
CREATE INDEX IF NOT EXISTS textbook_pages_page_number_idx
  ON textbook_pages (page_number);

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
