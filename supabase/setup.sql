/*
  ⚠️ لا تُشغّل هذا الملف على مشروع «سراج».
  هو مخصص للوضع المستقل (جدول textbook_pages الخاص بهذا التطبيق) لمشروع Supabase فارغ.
  للرفع إلى سراج استخدم بدلاً منه: supabase/migrations/20260808_ingest_schema.sql
  والدليل في supabase/SIRAJ_INGEST.md.

  إعداد كامل وقابل لإعادة التشغيل لمشروع Supabase جديد.
  شغّله مرة واحدة من: Supabase Dashboard → SQL Editor → New query → Run.
  يجمع كل ملفات supabase/migrations في ملف واحد.
*/

-- 1) الجدول
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
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE textbook_pages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2) الفهارس + قيد التفرّد اللازم لعملية upsert عند إعادة المحاولة
CREATE INDEX IF NOT EXISTS textbook_pages_grade_term_idx ON textbook_pages (grade, term);
CREATE INDEX IF NOT EXISTS textbook_pages_page_number_idx ON textbook_pages (page_number);
CREATE INDEX IF NOT EXISTS idx_textbook_pages_metadata_part ON textbook_pages ((metadata->>'part'));

DO $$
BEGIN
  ALTER TABLE textbook_pages ADD CONSTRAINT textbook_pages_storage_path_key UNIQUE (storage_path);
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- 3) سياسات الجدول (تطبيق أحادي المستأجر بلا تسجيل دخول)
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

-- 4) حاوية التخزين
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
