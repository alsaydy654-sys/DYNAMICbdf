import { AppConfig, DEFAULT_CONFIG } from "./types";

const STORAGE_KEY = "textbook-pdf-processor:config";

const ARABIC_TO_LATIN: Record<string, string> = {
  ا: "a", أ: "a", إ: "a", آ: "a", ء: "a", ب: "b", ت: "t", ث: "th", ج: "j",
  ح: "h", خ: "kh", د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s",
  ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l",
  م: "m", ن: "n", ه: "h", ة: "h", و: "w", ؤ: "w", ي: "y", ى: "a", ئ: "y",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/**
 * Convert an arbitrary label (Arabic, spaces, punctuation) into a safe
 * ASCII identifier usable as a column name or a storage path segment.
 */
export function sanitizeColumnName(name: string): string {
  if (!name) return "";
  const transliterated = Array.from(name)
    .map((ch) => (ch in ARABIC_TO_LATIN ? ARABIC_TO_LATIN[ch] : ch))
    .join("");

  return transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u0652]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function extensionFor(config: AppConfig): string {
  return config.imageFormat === "image/png" ? ".png" : ".jpeg";
}

export function buildFileName(pageIndex: number, config: AppConfig): string {
  const digits = Math.max(1, Math.min(8, config.zeroPadDigits || 1));
  const padded = String(pageIndex).padStart(digits, "0");
  const prefix = sanitizeColumnName(config.customPrefix || "");
  return `${prefix ? `${prefix}_` : ""}${padded}${extensionFor(config)}`;
}

export function buildStoragePath(
  fileName: string,
  context: { grade: string; term: string },
  config: AppConfig
): string {
  const base = (config.basePath || "")
    .split("/")
    .map((segment) => sanitizeColumnName(segment))
    .filter(Boolean);

  const segments = [
    ...base,
    sanitizeColumnName(context.grade),
    sanitizeColumnName(context.term),
    fileName,
  ].filter(Boolean);

  return segments.join("/");
}

export function previewPath(config: AppConfig, grade = "", term = ""): string {
  return buildStoragePath(buildFileName(1, config), { grade, term }, config);
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      columns: { ...DEFAULT_CONFIG.columns, ...(parsed.columns ?? {}) },
      ingest: { ...DEFAULT_CONFIG.ingest, ...(parsed.ingest ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function resetConfig(): AppConfig {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}
