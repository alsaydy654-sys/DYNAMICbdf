/*
  خدمة استقبال كتب المناهج — إدارية بحتة.

  التطبيق العميل لا يملك أي صلاحية كتابة في قاعدة سراج ولا في الحاوية؛ كل شيء يمر
  من هنا بمفتاح service_role، ومحمي بتوكن إداري (INGEST_ADMIN_TOKEN) لا يُخزَّن إلا
  عند المسؤول. الرفع نفسه يتم بروابط موقّعة قصيرة العمر.

  الإجراءات (POST JSON):
    { action: "resolve", curriculum, grade, subject }
    { action: "start",   curriculum, grade, subject, bookTitle, unitTitle?, originalPdfName?, pageCount? }
    { action: "sign",    uploadId, pageNumber, fileName }
    { action: "record",  uploadId, pageNumber, storagePath, mimeType?, fileSize? }
    { action: "publish", uploadId }
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKET = "curriculum-textbooks";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const ARABIC_TO_LATIN: Record<string, string> = {
  ا: "a", أ: "a", إ: "a", آ: "a", ء: "a", ب: "b", ت: "t", ث: "th", ج: "j",
  ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s",
  ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l",
  م: "m", ن: "n", ه: "h", ة: "h", و: "w", ؤ: "w", ي: "y", ى: "a", ئ: "y",
};

/** نفس منطق sanitizeColumnName في العميل: مسارات ASCII آمنة. */
function slug(value: string): string {
  return Array.from(value ?? "")
    .map((ch) => ARABIC_TO_LATIN[ch] ?? ch)
    .join("")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

interface Payload {
  action?: string;
  curriculum?: string;
  grade?: string;
  subject?: string;
  bookTitle?: string;
  unitTitle?: string;
  originalPdfName?: string;
  pageCount?: number;
  uploadId?: string;
  pageNumber?: number;
  fileName?: string;
  storagePath?: string;
  pathPrefix?: string;
  mimeType?: string;
  fileSize?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Only POST is supported" }, 405);

  const adminToken = Deno.env.get("INGEST_ADMIN_TOKEN");
  if (!adminToken) return json({ error: "INGEST_ADMIN_TOKEN is not configured on the server" }, 500);
  if (req.headers.get("x-ingest-token") !== adminToken) {
    return json({ error: "Unauthorized: invalid or missing x-ingest-token" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const required = (...names: (keyof Payload)[]) => {
    const missing = names.filter((n) => body[n] === undefined || body[n] === null || body[n] === "");
    return missing.length ? `Missing required field(s): ${missing.join(", ")}` : null;
  };

  try {
    switch (body.action) {
      case "resolve": {
        const err = required("curriculum", "grade", "subject");
        if (err) return json({ error: err }, 400);
        const { data, error } = await supabase.rpc("ingest_resolve_target", {
          p_curriculum: body.curriculum,
          p_grade: body.grade,
          p_subject: body.subject,
        });
        if (error) throw error;
        return json(data);
      }

      case "start": {
        const err = required("curriculum", "grade", "subject", "bookTitle");
        if (err) return json({ error: err }, 400);

        const { data: target, error: resolveError } = await supabase.rpc("ingest_resolve_target", {
          p_curriculum: body.curriculum,
          p_grade: body.grade,
          p_subject: body.subject,
        });
        if (resolveError) throw resolveError;
        if (!target || (target as { matches: number }).matches === 0) {
          return json(
            {
              error:
                `لا توجد مادة في سراج بهذه الأسماء: المنهج "${body.curriculum}"، الصف "${body.grade}"، المادة "${body.subject}".`,
            },
            422
          );
        }

        const { data, error } = await supabase.rpc("ingest_start_upload", {
          p_curriculum: body.curriculum,
          p_grade: body.grade,
          p_subject: body.subject,
          p_book_title: body.bookTitle,
          p_unit_title: body.unitTitle ?? null,
          p_original_pdf_name: body.originalPdfName ?? null,
          p_page_count: body.pageCount ?? null,
        });
        if (error) throw error;

        const uploadId = data as string;
        const prefix = [slug(body.curriculum!), slug(body.grade!), slug(body.subject!), uploadId].join("/");
        return json({ uploadId, pathPrefix: prefix, bucket: BUCKET });
      }

      case "sign": {
        const err = required("uploadId", "pageNumber", "fileName");
        if (err) return json({ error: err }, 400);

        if (!UUID_RE.test(body.uploadId!)) {
          return json({ error: "uploadId must be a uuid" }, 400);
        }
        // البادئة مقيّدة بأن تنتهي بمعرف الرفع، فلا يمكن الكتابة خارج مجلده
        const prefix = body.pathPrefix ?? body.uploadId!;
        if (!new RegExp(`^(?:[a-z0-9_]+/)*${body.uploadId}$`, "i").test(prefix)) {
          return json({ error: "pathPrefix must be slug segments ending with the uploadId" }, 400);
        }
        const extension = body.fileName!.match(/\.[^.]+$/)?.[0] ?? "";
        const stem = slug(body.fileName!.replace(/\.[^.]+$/, "")) || String(body.pageNumber);
        const path = `${prefix}/${stem}${extension}`;
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, {
          upsert: true,
        });
        if (error) throw error;
        return json({ ...data, bucket: BUCKET, storagePath: path });
      }

      case "record": {
        const err = required("uploadId", "pageNumber", "storagePath");
        if (err) return json({ error: err }, 400);
        const { error } = await supabase.rpc("ingest_record_page", {
          p_upload_id: body.uploadId,
          p_page_number: body.pageNumber,
          p_storage_path: body.storagePath,
          p_mime_type: body.mimeType ?? null,
          p_file_size: body.fileSize ?? null,
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "publish": {
        const err = required("uploadId");
        if (err) return json({ error: err }, 400);
        const { data, error } = await supabase.rpc("ingest_publish_upload", {
          p_upload_id: body.uploadId,
          p_base_url: Deno.env.get("SUPABASE_URL") ?? null,
        });
        if (error) throw error;
        return json({ lessonId: data });
      }

      default:
        return json({ error: `Unknown action: ${body.action ?? "(none)"}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
