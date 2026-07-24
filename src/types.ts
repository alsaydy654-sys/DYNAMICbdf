export type ImageFormat = "image/jpeg" | "image/png";

export interface TableColumnMapping {
  fileName: string;
  storagePath: string;
  pageNumber: string;
  grade: string;
  term: string;
  originalPdfName: string;
  bookTitle: string;
  mimeType: string;
  fileSize: string;
}

export interface AppConfig {
  storageBucket: string;
  /** Root base path, e.g. "المناهج/صنعاء". Grade/Term/filename auto-appended. */
  basePath: string;
  tableName: string;
  columns: TableColumnMapping;
  zeroPadDigits: number;
  customPrefix: string;
  imageFormat: ImageFormat;
  /** JPEG quality 0..1 (ignored for png) */
  jpegQuality: number;
  /** Render scale for PDF -> image (CSS pixels multiplier) */
  renderScale: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  storageBucket: "textbooks",
  basePath: "المناهج/صنعاء",
  tableName: "textbook_pages",
  columns: {
    fileName: "file_name",
    storagePath: "storage_path",
    pageNumber: "page_number",
    grade: "grade",
    term: "term",
    originalPdfName: "original_pdf_name",
    bookTitle: "book_title",
    mimeType: "mime_type",
    fileSize: "file_size",
  },
  zeroPadDigits: 3,
  customPrefix: "",
  imageFormat: "image/jpeg",
  jpegQuality: 0.85,
  renderScale: 1.5,
};

export type LogLevel = "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
}

export type UploadStatus = "pending" | "processing" | "done" | "failed";

export interface PageRecord {
  index: number;
  pageNumber: number;
  fileName: string;
  storagePath: string;
  blob: Blob;
  status: UploadStatus;
  error?: string;
  insertedId?: string;
}

/** Shape consumed by ResultsScreen — one entry per processed page. */
export interface ResultLog {
  pageNumber: number;
  status: "success" | "error";
  message: string;
}
