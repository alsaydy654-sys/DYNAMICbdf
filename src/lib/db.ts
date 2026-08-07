import { supabase } from './supabase';
import { sanitizeColumnName, buildStoragePath } from '../config';
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
  // 1. تطبيع أسماء الأعمدة من الإعداد
  const sanitizedCols = Object.fromEntries(
    Object.entries(config.columns).map(([k, v]) => [k, sanitizeColumnName(v)])
  ) as Record<string, string>;

  // 2. بناء مسار التخزين الآمن (إذا لم يوفَّر fullPath من caller)
  const storagePath = buildStoragePath(pageData.fileName, { grade: context.grade, term: context.term }, config);

  // 3. بناء payload باستخدام المفاتيح المطهّرة (افترضت وجود الأسماء الافتراضية)
  const payload: Record<string, any> = {};
  payload[sanitizedCols.fileName || 'file_name'] = pageData.fileName;
  payload[sanitizedCols.storagePath || 'storage_path'] = storagePath;
  payload[sanitizedCols.pageNumber || 'page_number'] = pageData.pageNumber;
  payload[sanitizedCols.grade || 'grade'] = context.grade;
  payload[sanitizedCols.term || 'term'] = context.term;
  // الحقول الاختيارية من pageData
  if (pageData.originalPdfName) payload[sanitizedCols.originalPdfName || 'original_pdf_name'] = pageData.originalPdfName;
  if (pageData.bookTitle) payload[sanitizedCols.bookTitle || 'book_title'] = pageData.bookTitle;
  payload[sanitizedCols.mimeType || 'mime_type'] = pageData.mimeType ?? (pageData.blob ? (pageData.blob as any).type : 'image/jpeg');
  payload[sanitizedCols.fileSize || 'file_size'] = pageData.fileSize ?? (pageData.blob ? (pageData.blob as any).size : null);

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
