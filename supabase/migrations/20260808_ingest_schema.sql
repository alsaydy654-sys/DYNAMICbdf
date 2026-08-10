/*
  # طبقة استقبال معزولة لرفع كتب المناهج إلى قاعدة «سراج»

  ## المبدأ
  لا يكتب هذا التطبيق في جداول سراج الحالية (curricula/grades/subjects/units/lessons)
  إلا بإضافة صفوف جديدة عبر دالة واحدة مُتحكَّم بها. كل بيانات الرفع الخام تعيش في
  schema مستقل `ingest` غير مكشوف عبر PostgREST، والوصول إليه بمفتاح service_role فقط
  (من خلال Edge Function محمية بتوكن إداري).

  ## المكوّنات
  - `ingest.uploads`  — صف لكل عملية رفع كتاب (المنهج/الصف/المادة كأسماء نصية + الحالة).
  - `ingest.pages`    — صف لكل صفحة صورة داخل الحاوية.
  - حاوية `curriculum-textbooks` — قراءة عامة (لتُعرض في سراج)، بلا أي صلاحية كتابة لـ anon.
  - `ingest.publish_upload(uuid)` — تُطابق الأسماء على معرّفات سراج (قراءة فقط) ثم
    تُنشئ/تُحدّث درساً واحداً يملكه هذا الرفع. لا تُعدّل ولا تحذف أي صف موجود مسبقاً.

  إعادة التشغيل آمنة (idempotent).
*/

CREATE SCHEMA IF NOT EXISTS ingest;

-- الحماية: لا وصول لـ anon/authenticated؛ service_role فقط.
REVOKE ALL ON SCHEMA ingest FROM PUBLIC;
REVOKE ALL ON SCHEMA ingest FROM anon, authenticated;
GRANT USAGE ON SCHEMA ingest TO service_role;

CREATE TABLE IF NOT EXISTS ingest.uploads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_name    text NOT NULL,
  grade_name         text NOT NULL,
  subject_name       text NOT NULL,
  unit_title         text,
  book_title         text NOT NULL,
  original_pdf_name  text,
  page_count         integer,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'uploading', 'ready', 'published', 'failed')),
  error              text,
  -- الدرس الذي أنشأته هذه العملية؛ لا نلمس أي درس آخر
  published_lesson_id uuid,
  published_unit_id   uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest.pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id    uuid NOT NULL REFERENCES ingest.uploads(id) ON DELETE CASCADE,
  page_number  integer NOT NULL,
  storage_path text NOT NULL,
  mime_type    text,
  file_size    bigint,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (upload_id, page_number),
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_ingest_pages_upload ON ingest.pages (upload_id, page_number);
CREATE INDEX IF NOT EXISTS idx_ingest_uploads_status ON ingest.uploads (status, created_at DESC);

ALTER TABLE ingest.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.pages ENABLE ROW LEVEL SECURITY;
-- بلا أي سياسة: كل الوصول يمرّ عبر service_role (الذي يتخطى RLS).

-- ── الحاوية ───────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
SELECT 'curriculum-textbooks', 'curriculum-textbooks', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'curriculum-textbooks');

-- قراءة عامة فقط؛ الرفع يتم بروابط موقّعة تصدرها الـ Edge Function.
DROP POLICY IF EXISTS "public_read_curriculum_textbooks" ON storage.objects;
CREATE POLICY "public_read_curriculum_textbooks" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'curriculum-textbooks');

-- ── دالة النشر ────────────────────────────────────────────────────────────────
/*
  تُحوّل رفعاً مكتملاً إلى درس واحد في سراج:
    curricula.name + grades.name + subjects.name  →  subject_id
    unit: يُستخدم الموجود بنفس العنوان أو يُنشأ جديد
    lesson: يُنشأ مرة واحدة ويُحدَّث لاحقاً فقط إن كان مملوكاً لنفس الرفع
  ترمي استثناءً واضحاً إن تعذّر المطابقة، فلا يحدث نشر جزئي.
*/
CREATE OR REPLACE FUNCTION ingest.publish_upload(p_upload_id uuid, p_base_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ingest, public
AS $$
DECLARE
  v_upload      ingest.uploads;
  v_subject_id  uuid;
  v_match_count integer;
  v_unit_id     uuid;
  v_unit_title  text;
  v_lesson_id   uuid;
  v_images      text[];
  v_page_count  integer;
  v_base_url    text;
BEGIN
  SELECT * INTO v_upload FROM ingest.uploads WHERE id = p_upload_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload % not found', p_upload_id;
  END IF;

  -- 1) مطابقة المادة داخل بنية سراج (قراءة فقط)
  SELECT count(*) INTO v_match_count
  FROM public.subjects s
  JOIN public.grades g     ON g.id = s.grade_id
  JOIN public.curricula c  ON c.id = g.curriculum_id
  WHERE c.name = v_upload.curriculum_name
    AND g.name = v_upload.grade_name
    AND s.name = v_upload.subject_name;

  IF v_match_count = 0 THEN
    RAISE EXCEPTION 'No Siraj subject matches curriculum=%, grade=%, subject=%',
      v_upload.curriculum_name, v_upload.grade_name, v_upload.subject_name;
  END IF;

  -- عند التكرار (مناهج بنفس الاسم) نختار الأحدث حتى تبقى العملية حتمية
  SELECT s.id INTO v_subject_id
  FROM public.subjects s
  JOIN public.grades g     ON g.id = s.grade_id
  JOIN public.curricula c  ON c.id = g.curriculum_id
  WHERE c.name = v_upload.curriculum_name
    AND g.name = v_upload.grade_name
    AND s.name = v_upload.subject_name
  ORDER BY c.created_at DESC, s.created_at DESC
  LIMIT 1;

  -- 2) الوحدة: نستخدم الموجودة بنفس العنوان أو نُنشئ واحدة جديدة
  v_unit_title := COALESCE(NULLIF(btrim(v_upload.unit_title), ''), v_upload.book_title);

  SELECT id INTO v_unit_id
  FROM public.units
  WHERE subject_id = v_subject_id AND title = v_unit_title
  ORDER BY created_at
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    INSERT INTO public.units (subject_id, title, description, sort_order)
    VALUES (
      v_subject_id,
      v_unit_title,
      'أُضيفت آلياً من رافع كتب المناهج',
      COALESCE((SELECT max(sort_order) + 1 FROM public.units WHERE subject_id = v_subject_id), 1)
    )
    RETURNING id INTO v_unit_id;
  END IF;

  -- 3) روابط صور الصفحات بالترتيب
  -- الـ Edge Function تمرر عنوان المشروع؛ وإلا نكتفي بمسار نسبي
  v_base_url := COALESCE(NULLIF(btrim(p_base_url), ''), '') ||
                '/storage/v1/object/public/curriculum-textbooks/';

  SELECT array_agg(v_base_url || p.storage_path ORDER BY p.page_number), count(*)
  INTO v_images, v_page_count
  FROM ingest.pages p
  WHERE p.upload_id = p_upload_id;

  IF v_page_count IS NULL OR v_page_count = 0 THEN
    RAISE EXCEPTION 'Upload % has no recorded pages', p_upload_id;
  END IF;

  -- 4) الدرس: إنشاء مرة واحدة، ثم تحديث الدرس المملوك لهذا الرفع فقط
  IF v_upload.published_lesson_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.lessons WHERE id = v_upload.published_lesson_id) THEN
    UPDATE public.lessons
    SET title       = v_upload.book_title,
        page_start  = 1,
        page_end    = v_page_count,
        images_urls = v_images
    WHERE id = v_upload.published_lesson_id
    RETURNING id INTO v_lesson_id;
  ELSE
    INSERT INTO public.lessons (unit_id, title, content_text, page_start, page_end, images_urls, sort_order)
    VALUES (
      v_unit_id,
      v_upload.book_title,
      '',
      1,
      v_page_count,
      v_images,
      COALESCE((SELECT max(sort_order) + 1 FROM public.lessons WHERE unit_id = v_unit_id), 1)
    )
    RETURNING id INTO v_lesson_id;
  END IF;

  UPDATE ingest.uploads
  SET status = 'published',
      page_count = v_page_count,
      published_lesson_id = v_lesson_id,
      published_unit_id = v_unit_id,
      error = NULL,
      updated_at = now()
  WHERE id = p_upload_id;

  RETURN v_lesson_id;
END;
$$;

REVOKE ALL ON FUNCTION ingest.publish_upload(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ingest.publish_upload(uuid, text) TO service_role;

-- ── واجهة RPC ─────────────────────────────────────────────────────────────────
/*
  schema الـ ingest غير مكشوف عبر PostgREST، لذا نكشف دوال رقيقة في public
  صلاحية تنفيذها لـ service_role فقط (أي: الـ Edge Function وحدها).
*/
CREATE OR REPLACE FUNCTION public.ingest_start_upload(
  p_curriculum text,
  p_grade text,
  p_subject text,
  p_book_title text,
  p_unit_title text DEFAULT NULL,
  p_original_pdf_name text DEFAULT NULL,
  p_page_count integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ingest, public
AS $$
  INSERT INTO ingest.uploads (
    curriculum_name, grade_name, subject_name, book_title,
    unit_title, original_pdf_name, page_count, status
  )
  VALUES (
    btrim(p_curriculum), btrim(p_grade), btrim(p_subject), btrim(p_book_title),
    NULLIF(btrim(coalesce(p_unit_title, '')), ''), p_original_pdf_name, p_page_count, 'uploading'
  )
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.ingest_record_page(
  p_upload_id uuid,
  p_page_number integer,
  p_storage_path text,
  p_mime_type text DEFAULT NULL,
  p_file_size bigint DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ingest, public
AS $$
  INSERT INTO ingest.pages (upload_id, page_number, storage_path, mime_type, file_size)
  VALUES (p_upload_id, p_page_number, p_storage_path, p_mime_type, p_file_size)
  ON CONFLICT (upload_id, page_number)
  DO UPDATE SET storage_path = excluded.storage_path,
                mime_type = excluded.mime_type,
                file_size = excluded.file_size;
$$;

CREATE OR REPLACE FUNCTION public.ingest_publish_upload(p_upload_id uuid, p_base_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ingest, public
AS $$
  SELECT ingest.publish_upload(p_upload_id, p_base_url);
$$;

/* مطابقة الأسماء قبل بدء الرفع، حتى لا يُحوَّل كتاب كامل ثم يفشل النشر. */
CREATE OR REPLACE FUNCTION public.ingest_resolve_target(
  p_curriculum text,
  p_grade text,
  p_subject text
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = ingest, public
AS $$
  SELECT json_build_object(
    'matches', count(*),
    'subject_id', (
      SELECT s.id FROM public.subjects s
      JOIN public.grades g    ON g.id = s.grade_id
      JOIN public.curricula c ON c.id = g.curriculum_id
      WHERE c.name = btrim(p_curriculum) AND g.name = btrim(p_grade) AND s.name = btrim(p_subject)
      ORDER BY c.created_at DESC, s.created_at DESC LIMIT 1
    )
  )
  FROM public.subjects s
  JOIN public.grades g    ON g.id = s.grade_id
  JOIN public.curricula c ON c.id = g.curriculum_id
  WHERE c.name = btrim(p_curriculum) AND g.name = btrim(p_grade) AND s.name = btrim(p_subject);
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.ingest_start_upload(text,text,text,text,text,text,integer)',
    'public.ingest_record_page(uuid,integer,text,text,bigint)',
    'public.ingest_publish_upload(uuid,text)',
    'public.ingest_resolve_target(text,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- عرض إداري لمتابعة الرفوعات (service_role فقط)
CREATE OR REPLACE VIEW ingest.v_uploads AS
SELECT u.*, (SELECT count(*) FROM ingest.pages p WHERE p.upload_id = u.id) AS uploaded_pages
FROM ingest.uploads u;

GRANT SELECT ON ingest.v_uploads TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA ingest TO service_role;
