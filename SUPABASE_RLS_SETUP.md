# إعداد Supabase RLS (Row Level Security)

## 📋 متطلبات الإعداد الأمني

هذا المستند يشرح كيفية تفعيل سياسات الأمان على مستوى الصفوف (RLS) في Supabase للسماح بعمليات الإدراج (Insert) للمستخدمين المجهولين (Anonymous Users).

---

## ✅ الخطوة 1: تفعيل RLS على جدول البيانات

### من خلال لوحة التحكم:

1. **انتقل إلى Supabase Dashboard**
   - ادخل على [https://app.supabase.com](https://app.supabase.com)
   - اختر مشروعك

2. **افتح Table Editor**
   - انقر على **Table Editor** من القائمة اليسرى
   - اختر جدول `textbook_pages` (أو اسم جدولك)

3. **فعّل RLS**
   - انقر على **RLS** (Row Level Security) في أعلى الجدول
   - اضغط على **Enable RLS**
   - سيظهر إشعار: ✅ "RLS is now enabled for this table"

---

## ✅ الخطوة 2: إنشاء سياسة الإدراج للمستخدمين المجهولين

### الطريقة الأولى: من خلال لوحة التحكم (موصى بها)

1. **افتح تبويب الأمان (Security)**
   - انقر على **Security** في أعلى الجدول

2. **أضف سياسة جديدة**
   - اضغط على **New Policy**
   - اختر **Insert**

3. **أدخل تفاصيل السياسة:**
   - **Policy Name:** `Allow anonymous inserts`
   - **Action:** `INSERT`
   - **Using Expression:** اتركها فارغة (أو اختر `true`)
   - **With Check:** اختر **Custom** وأدخل:
     ```sql
     auth.uid() IS NULL
     ```

4. **احفظ السياسة**
   - اضغط **Save**

---

### الطريقة الثانية: تنفيذ SQL مباشرة

افتح **SQL Editor** من القائمة اليسرى وشغّل هذا الأمر:

```sql
-- السماح بإدراج البيانات للمستخدمين المجهولين فقط
CREATE POLICY "Allow anonymous inserts"
ON public.textbook_pages
FOR INSERT
WITH CHECK (auth.uid() IS NULL);

-- (اختياري) السماح بقراءة البيانات للجميع
CREATE POLICY "Allow public read"
ON public.textbook_pages
FOR SELECT
USING (true);
```

**ملاحظة:** استبدل `textbook_pages` باسم جدولك الفعلي.

---

## ✅ الخطوة 3: التحقق من الإعدادات

### تحقق من:

1. **تفعيل RLS**
   - جدول > RLS يجب أن يكون **Enabled**

2. **السياسات المفعلة**
   - Security > Policies يجب أن تحتوي على:
     - ✅ `Allow anonymous inserts` (Insert)
     - ✅ `Allow public read` (Select) - اختياري

3. **الأذونات الافتراضية**
   - إذا كانت RLS مفعلة بدون سياسات، ستكون جميع العمليات مرفوضة
   - تأكد من وجود سياسة لـ INSERT قبل الرفع

---

## ⚠️ الخطوة 4: التحقق من الأمان والأداء

### نقاط أمانية مهمة:

```sql
-- حماية إضافية: تحديد معدل الإدراج (يتطلب PostgreSQL 15+)
CREATE POLICY "Rate limit anonymous inserts"
ON public.textbook_pages
FOR INSERT
WITH CHECK (
  auth.uid() IS NULL 
  AND (
    SELECT COUNT(*) FROM public.textbook_pages
    WHERE created_at > NOW() - INTERVAL '1 hour'
    AND created_by = current_user_id()
  ) < 1000  -- حد أقصى 1000 إدراج في الساعة
);
```

### نصائح الأمان:

1. **استخدم Anon Key فقط للتطبيق العام**
   - لا تشارك Service Role Key علناً

2. **راقب الإدراجات المريبة**
   - استخدم Supabase Logs لمراقبة محاولات الإدراج

3. **أضف التحقق من الجانب العميل**
   - تحقق من حجم الصور وصيغتها قبل الرفع

4. **استخدم CORS بحذر**
   - قيّد النطاقات المسموحة في إعدادات CORS

---

## 🧪 اختبار السياسة

### اختبر من خلال تطبيقك:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY  // استخدم Anon Key
);

// محاولة الإدراج كمستخدم مجهول
const { data, error } = await supabase
  .from("textbook_pages")
  .insert({
    file_name: "page_001.jpeg",
    storage_path: "grade1_term1_page_001.jpeg",
    page_number: 1,
    grade: "الأول الابتدائي",
    term: "الترم الأول",
    original_pdf_name: "book.pdf",
    book_title: "الرياضيات",
    mime_type: "image/jpeg",
    file_size: 12345,
  });

if (error) {
  console.error("خطأ الإدراج:", error.message);
} else {
  console.log("✅ تم الإدراج بنجاح:", data);
}
```

---

## 🔍 استكشاف الأخطاء

### الخطأ: "Permission denied"

**السبب:** RLS مفعل ولا توجد سياسة INSERT للمستخدمين المجهولين

**الحل:**
1. تأكد من وجود السياسة `Allow anonymous inserts`
2. تحقق من أن `auth.uid() IS NULL` صحيح

### الخطأ: "42501 new row violates row-level security policy"

**السبب:** السياسة موجودة لكنها تحتوي على شرط لم يتم تحقيقه

**الحل:**
1. افتح SQL Editor
2. شغّل: `SELECT auth.uid();` - يجب أن تكون `NULL`
3. تأكد من استخدام Anon Key وليس Service Role Key

### الخطأ: "table textbook_pages does not exist"

**السبب:** اسم الجدول خاطئ أو الجدول لم ينشأ بعد

**الحل:**
1. تحقق من اسم الجدول في Table Editor
2. أنشئ الجدول إذا لم يكن موجوداً

---

## 📊 مراقبة الاستخدام

### عرض السجلات:

1. **من Supabase Dashboard:**
   - انقر على **Logs** (في القائمة اليسرى)
   - ستجد سجلات API Requests

2. **من SQL Editor:**
   ```sql
   -- عرض عدد الإدراجات اليومية
   SELECT 
     DATE(created_at) as date,
     COUNT(*) as insert_count
   FROM textbook_pages
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

---

## 📝 ملخص الأوامر SQL الضرورية

```sql
-- 1️⃣ تفعيل RLS على الجدول (إذا لم يكن مفعل)
ALTER TABLE public.textbook_pages ENABLE ROW LEVEL SECURITY;

-- 2️⃣ إنشاء سياسة الإدراج للمجهولين
CREATE POLICY "Allow anonymous inserts"
ON public.textbook_pages
FOR INSERT
WITH CHECK (auth.uid() IS NULL);

-- 3️⃣ (اختياري) السماح بالقراءة للجميع
CREATE POLICY "Allow public read"
ON public.textbook_pages
FOR SELECT
USING (true);

-- 4️⃣ عرض السياسات الموجودة
SELECT * FROM pg_policies WHERE tablename = 'textbook_pages';

-- 5️⃣ حذف سياسة إذا لزم الأمر
DROP POLICY "Allow anonymous inserts" ON public.textbook_pages;
```

---

## ✨ شرح تفصيلي للسياسات

| السياسة | الغرض | الشرط |
|--------|-------|--------|
| `Allow anonymous inserts` | السماح بإدراج الصور من المتصفح | `auth.uid() IS NULL` |
| `Allow public read` | السماح بقراءة البيانات | `true` (بدون قيود) |
| `Allow authenticated updates` | تحديث البيانات من المستخدمين المسجلين | `auth.uid() = user_id` |
| `Allow admin deletes` | حذف البيانات (للمسؤولين فقط) | `auth.role() = 'admin'` |

---

## 🎯 الخطوات التالية

بعد تفعيل RLS:

1. ✅ اختبر تطبيقك
2. ✅ راقب السجلات
3. ✅ أضف معالجة الأخطاء
4. ✅ ثقّف الفريق حول الأمان

---

**تم إنشاؤه:** 2026-08-07  
**آخر تحديث:** 2026-08-07  
**الإصدار:** 1.0
