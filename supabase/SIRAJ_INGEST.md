# طبقة استقبال المناهج إلى «سراج»

رفع كتب المناهج يتم عبر مسار إداري معزول تماماً عن جداول سراج الإنتاجية.

## البنية الفعلية في سراج (تم فحصها من قاعدة البيانات)

```
curricula (name, version, is_active)
  └── grades (curriculum_id, name, level, stage)
        └── subjects (grade_id, name, icon, color, sort_order)
              └── units (subject_id, title, description, sort_order)
                    └── lessons (unit_id, title, content_text, page_start, page_end, images_urls[], sort_order)
```

صور صفحات الكتاب تنتمي إلى `lessons.images_urls` مع `page_start`/`page_end`.
لا يوجد جدول `textbook_pages` في مشروع سراج، ولم يُنشأ.

## مسار البيانات

```
المتصفح (تبويب إداري مخفي)
   │  PDF → صور صفحات
   ▼
Edge Function  curriculum-ingest        ← توكن إداري x-ingest-token
   │  service_role فقط
   ├── ingest.uploads / ingest.pages    (schema معزول، غير مكشوف لـ anon)
   ├── حاوية curriculum-textbooks       (رفع بروابط موقّعة فقط)
   ▼
ingest.publish_upload()                 ← إضافة فقط
   └── درس واحد جديد في lessons + وحدة عند الحاجة
```

ضمانات العزل:

- `schema ingest` غير مكشوف عبر PostgREST، وصلاحياته مسحوبة من `anon` و`authenticated`.
- مفتاح anon لا يستطيع الكتابة في الحاوية؛ الرفع يتم برابط موقّع تُصدره الخدمة لكل صفحة.
- الدالة تقرأ `curricula/grades/subjects` فقط، ولا تُعدّل أو تحذف أي صف قائم.
- الدرس يُنشأ مرة واحدة، والتحديث اللاحق مقصور على الدرس المملوك لنفس عملية الرفع
  (`ingest.uploads.published_lesson_id`).
- لا يُنشر الكتاب إلا بعد نجاح كل صفحاته؛ الفشل الجزئي يبقى داخل `ingest` بلا أثر في سراج.

## النشر

1. شغّل `supabase/migrations/20260808_ingest_schema.sql` في SQL Editor.
2. اضبط سراً للخدمة ثم انشرها:

   ```bash
   supabase secrets set INGEST_ADMIN_TOKEN="$(openssl rand -hex 32)"
   supabase functions deploy curriculum-ingest --no-verify-jwt
   ```

   (`--no-verify-jwt` لأن التحقق يتم بالتوكن الإداري الخاص، لا بجلسة مستخدم.)

3. في التطبيق: الإعدادات ← «رفع إلى سراج — وضع إداري»، أدخل عنوان الخدمة والتوكن.
   عندها فقط يظهر تبويب الرفع الإداري؛ تركهما فارغين يُخفي المسار كلياً عن المستخدمين.

## المتابعة

```sql
SELECT * FROM ingest.v_uploads ORDER BY created_at DESC;   -- بمفتاح service_role
```
