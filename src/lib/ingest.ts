/*
  عميل طبقة الاستقبال الإدارية.

  لا يكتب هذا الملف شيئاً في قاعدة سراج ولا في الحاوية بمفتاح anon: كل عملية تمر عبر
  Edge Function محمية بتوكن إداري، والرفع يتم برابط موقّع تُصدره الخدمة لكل صفحة.
*/
import { supabase } from "./supabase";
import { AppConfig, PageRecord } from "../types";
import { withDeadline, withRetry } from "./retry";

export interface IngestTarget {
  curriculum: string;
  grade: string;
  subject: string;
  bookTitle: string;
  unitTitle?: string;
  originalPdfName?: string;
  pageCount?: number;
}

export interface IngestSession {
  uploadId: string;
  pathPrefix: string;
  bucket: string;
}

export interface RetryInfo {
  step: "upload" | "record";
  attempt: number;
  attempts: number;
  delayMs: number;
  message: string;
}

const UPLOAD_TIMEOUT_MS = 90_000;
const CALL_TIMEOUT_MS = 30_000;
const ATTEMPTS = 5;

export function ingestConfigError(config: AppConfig): string | null {
  const { functionUrl, adminToken } = config.ingest;
  if (!functionUrl.trim() || !adminToken.trim()) {
    return "وضع سراج غير مُهيّأ: أدخل عنوان خدمة الاستقبال والتوكن الإداري في الإعدادات.";
  }
  if (!/^https:\/\/\S+$/.test(functionUrl.trim())) {
    return `عنوان خدمة الاستقبال غير صالح: "${functionUrl}"`;
  }
  return null;
}

async function callIngest<T>(config: AppConfig, body: Record<string, unknown>): Promise<T> {
  const configError = ingestConfigError(config);
  if (configError) throw new Error(configError);

  const response = await withDeadline(
    fetch(config.ingest.functionUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-token": config.ingest.adminToken.trim(),
      },
      body: JSON.stringify(body),
    }),
    CALL_TIMEOUT_MS,
    `Ingest call ${String(body.action)}`
  );

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* نص غير JSON — نستخدمه كرسالة خطأ كما هو */
  }

  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? text ?? `HTTP ${response.status}`;
    throw new Error(`Ingest ${String(body.action)} failed (${response.status}): ${message}`);
  }
  return payload as T;
}

/** يتحقق من وجود المادة في سراج قبل تحويل الكتاب كاملاً. */
export async function resolveTarget(
  config: AppConfig,
  target: Pick<IngestTarget, "curriculum" | "grade" | "subject">
): Promise<{ matches: number; subject_id: string | null }> {
  return callIngest(config, { action: "resolve", ...target });
}

export async function startUpload(config: AppConfig, target: IngestTarget): Promise<IngestSession> {
  return callIngest<IngestSession>(config, { action: "start", ...target });
}

/** يرفع صفحة واحدة برابط موقّع ثم يسجّلها في جدول الاستقبال. */
export async function ingestPage(
  config: AppConfig,
  session: IngestSession,
  record: PageRecord,
  onRetry?: (info: RetryInfo) => void
): Promise<string> {
  const storagePath = await withRetry(
    async () => {
      const signed = await callIngest<{ path: string; token: string; storagePath: string }>(config, {
        action: "sign",
        uploadId: session.uploadId,
        pageNumber: record.pageNumber,
        fileName: record.fileName,
        pathPrefix: session.pathPrefix,
      });

      const { error } = await withDeadline(
        supabase.storage
          .from(session.bucket)
          .uploadToSignedUrl(signed.path, signed.token, record.blob, {
            contentType: config.imageFormat,
          }),
        UPLOAD_TIMEOUT_MS,
        `Signed upload of ${record.fileName}`
      );
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return signed.storagePath;
    },
    {
      attempts: ATTEMPTS,
      onAttemptFailed: (attempt, attempts, error, delayMs) =>
        onRetry?.({ step: "upload", attempt, attempts, delayMs, message: error.message }),
    }
  );

  await withRetry(
    () =>
      callIngest(config, {
        action: "record",
        uploadId: session.uploadId,
        pageNumber: record.pageNumber,
        storagePath,
        mimeType: config.imageFormat,
        fileSize: record.blob.size,
      }),
    {
      attempts: ATTEMPTS,
      onAttemptFailed: (attempt, attempts, error, delayMs) =>
        onRetry?.({ step: "record", attempt, attempts, delayMs, message: error.message }),
    }
  );

  return storagePath;
}

/** ينشر الرفع المكتمل: يُنشئ/يُحدّث درس سراج بصور الصفحات بالترتيب. */
export async function publishUpload(
  config: AppConfig,
  uploadId: string
): Promise<{ lessonId: string }> {
  return callIngest<{ lessonId: string }>(config, { action: "publish", uploadId });
}
