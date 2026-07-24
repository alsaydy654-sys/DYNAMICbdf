import { supabase } from "./supabase";
import { AppConfig, PageRecord } from "../types";

export interface SyncContext {
  grade: string;
  term: string;
  bookTitle: string;
  originalPdfName: string;
}

export async function syncPage(
  record: PageRecord,
  config: AppConfig,
  context: SyncContext
): Promise<{ insertedId: string | null }> {
  const { error: upErr } = await supabase.storage
    .from(config.storageBucket)
    .upload(record.storagePath, record.blob, {
      contentType: config.imageFormat,
      upsert: false,
    });

  if (upErr) {
    if (!/already exists/i.test(upErr.message)) {
      throw new Error(`Storage upload failed: ${upErr.message}`);
    }
  }

  const row: Record<string, unknown> = {
    [config.columns.fileName]: record.fileName,
    [config.columns.storagePath]: record.storagePath,
    [config.columns.pageNumber]: record.pageNumber,
    [config.columns.grade]: context.grade,
    [config.columns.term]: context.term,
    [config.columns.originalPdfName]: context.originalPdfName,
    [config.columns.bookTitle]: context.bookTitle,
    [config.columns.mimeType]: config.imageFormat,
    [config.columns.fileSize]: record.blob.size,
  };

  const { data, error: dbErr } = await supabase
    .from(config.tableName)
    .insert(row)
    .select("id")
    .maybeSingle();

  if (dbErr) {
    throw new Error(`DB insert failed: ${dbErr.message}`);
  }

  return { insertedId: data?.id ?? null };
}
