import { supabase } from './supabase';
import { buildStoragePath } from '../config';
import type { AppConfig } from '../types';

/**
 * Insert a page record into the configured table.
 * - Normalizes column names from config.columns
 * - Stores dynamic pieces (e.g. part) inside metadata JSON to avoid schema changes
 */
export async function insertPageToDb(
  pageData: {
    fileName: string;
    pageNumber: number;
    blob?: Blob;
    mimeType?: string;
    fileSize?: number;
    originalPdfName?: string;
    bookTitle?: string;
  },
  config: AppConfig,
  context: { grade: string; term: string; part?: string }
) {
  // 1. أسماء الأعمدة كما هي من الإعداد (مطابقة لما يستخدمه sync.ts)
  const cols = config.columns;

  // 2. بناء مسار التخزين الآمن (إذا لم يوفَّر fullPath من caller)
  const storagePath = buildStoragePath(pageData.fileName, { grade: context.grade, term: context.term }, config);

  // 3. بناء payload باستخدام أسماء الأعمدة المُعدّة
  const payload: Record<string, unknown> = {};
  payload[cols.fileName] = pageData.fileName;
  payload[cols.storagePath] = storagePath;
  payload[cols.pageNumber] = pageData.pageNumber;
  payload[cols.grade] = context.grade;
  payload[cols.term] = context.term;
  // الحقول الاختيارية من pageData
  if (pageData.originalPdfName) payload[cols.originalPdfName] = pageData.originalPdfName;
  if (pageData.bookTitle) payload[cols.bookTitle] = pageData.bookTitle;
  payload[cols.mimeType] = pageData.mimeType ?? pageData.blob?.type ?? 'image/jpeg';
  payload[cols.fileSize] = pageData.fileSize ?? pageData.blob?.size ?? null;

  // 4. ضع الأجزاء الديناميكية داخل metadata لمنع تغيّر الـ schema
  payload['metadata'] = {
    part: context.part ?? 'default',
    uploaded_at: new Date().toISOString(),
  };

  // 5. إرسال الإدراج لـ Supabase
  const { data, error } = await supabase.from(config.tableName).insert([payload]);

  if (error) {
    console.error('Error inserting page:', error);
  }
  return { data, error };
}
