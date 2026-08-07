import { supabase } from "./supabase";
import { AppConfig, PageRecord } from "../types";
import { withDeadline, withRetry } from "./retry";

export interface SyncContext {
  grade: string;
  term: string;
  bookTitle: string;
  originalPdfName: string;
}

export interface SyncHooks {
  /** Called before each retry so the UI can explain the delay to the user. */
  onRetry?: (info: { step: "upload" | "insert"; attempt: number; attempts: number; delayMs: number; message: string }) => void;
}

const UPLOAD_TIMEOUT_MS = 90_000;
const INSERT_TIMEOUT_MS = 30_000;
const ATTEMPTS = 5;

export async function syncPage(
  record: PageRecord,
  config: AppConfig,
  context: SyncContext,
  hooks: SyncHooks = {}
): Promise<{ insertedId: string | null }> {
  // 1) رفع الصورة — upsert يجعل إعادة المحاولة آمنة بعد انقطاع الشبكة
  const storagePath = await withRetry(
    async () => {
      const { data, error } = await withDeadline(
        supabase.storage.from(config.storageBucket).upload(record.storagePath, record.blob, {
          contentType: config.imageFormat,
          upsert: true,
        }),
        UPLOAD_TIMEOUT_MS,
        `Storage upload of ${record.fileName}`
      );
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return data?.path ?? record.storagePath;
    },
    {
      attempts: ATTEMPTS,
      onAttemptFailed: (attempt, attempts, error, delayMs) =>
        hooks.onRetry?.({ step: "upload", attempt, attempts, delayMs, message: error.message }),
    }
  );

  if (!storagePath) {
    throw new Error("Missing storage path after upload; aborting DB insert.");
  }

  // 2) الإدراج في الجدول — upsert على مسار التخزين يمنع التكرار عند إعادة المحاولة
  const row: Record<string, unknown> = {
    [config.columns.fileName]: record.fileName,
    [config.columns.storagePath]: storagePath,
    [config.columns.pageNumber]: record.pageNumber,
    [config.columns.grade]: context.grade,
    [config.columns.term]: context.term,
    [config.columns.originalPdfName]: context.originalPdfName,
    [config.columns.bookTitle]: context.bookTitle,
    [config.columns.mimeType]: config.imageFormat,
    [config.columns.fileSize]: record.blob.size,
  };

  return withRetry(
    async () => {
      const query = supabase.from(config.tableName);
      const attempt = (useUpsert: boolean) =>
        (useUpsert
          ? query.upsert(row, { onConflict: config.columns.storagePath })
          : query.insert(row)
        )
          .select("id")
          .abortSignal(AbortSignal.timeout(INSERT_TIMEOUT_MS))
          .maybeSingle();

      let { data, error } = await attempt(true);
      // إن لم يوجد قيد UNIQUE على مسار التخزين (لم تُطبَّق الهجرة) نرجع للإدراج العادي
      if (error && /no unique|exclusion constraint|ON CONFLICT/i.test(error.message)) {
        ({ data, error } = await attempt(false));
      }

      if (error) throw new Error(`DB insert failed: ${error.message}`);
      return { insertedId: (data as { id?: string } | null)?.id ?? null };
    },
    {
      attempts: ATTEMPTS,
      onAttemptFailed: (attempt, attempts, error, delayMs) =>
        hooks.onRetry?.({ step: "insert", attempt, attempts, delayMs, message: error.message }),
    }
  );
}
