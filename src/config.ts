import { AppConfig, DEFAULT_CONFIG } from "./types";

const STORAGE_KEY = "tbp.config.v2";

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      columns: { ...DEFAULT_CONFIG.columns, ...(parsed.columns ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota errors */
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

export function extensionFor(format: AppConfig["imageFormat"]): string {
  return format === "image/png" ? "png" : "jpeg";
}

export function padIndex(index: number, digits: number): string {
  return String(index).padStart(digits, "0");
}

/**
 * تحويل النص إلى صيغة آمنة للـ Storage:
 * - تحويل الحروف العربية إلى أرقام/حروف إنجليزية
 * - إزالة المسافات واستبدالها بـ underscore
 * - إزالة الأحرف الخاصة
 */
export function sanitizePathSegment(text: string): string {
  // خريطة تحويل الحروف العربية إلى الإنجليزية
  const arabicToEnglishMap: Record<string, string> = {
    ا: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh",
    د: "d", ذ: "dh", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s",
    ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q",
    ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w", ي: "y",
    ة: "a", أ: "a", إ: "i", آ: "a", ى: "a", ؤ: "u", ئ: "y",
  };

  return text
    .split("")
    .map((char) => arabicToEnglishMap[char] || char)
    .join("")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // استبدال المسافات بـ underscore
    .replace(/[^\w\-_]/g, "") // إزالة أحرف خاصة
    .replace(/_+/g, "_") // إزالة underscores المتكررة
    .replace(/^_+|_+$/g, ""); // إزالة underscores من البداية والنهاية
}

// دالة تطهير أسماء الأعمدة قبل استخدامها في الاستعلامات
export function sanitizeColumnName(col: string): string {
  return col
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '')
    .replace(/^_+|_+$/g, '');
}

export function buildFileName(index: number, config: AppConfig): string {
  const padded = padIndex(index, config.zeroPadDigits);
  const prefix = config.customPrefix || "";
  const ext = extensionFor(config.imageFormat);
  return `${prefix}${padded}.${ext}`;
}

/**
 * بناء مسار التخزين بصيغة آمنة:
 *   <basePath>/<grade>/<term>/<fileName>
 * جميع القطاعات يتم تنظيفها من الأحرف غير الآمنة
 */
export function buildStoragePath(
  pageFileName: string,
  context: { grade: string; term: string },
  config: AppConfig
): string {
  // تنظيف كل قطعة من المسار
  const segments = [
    sanitizePathSegment(config.basePath),
    sanitizePathSegment(context.grade),
    sanitizePathSegment(context.term),
    pageFileName, // اسم الملف لا يحتاج تنظيف لأنه مُنتج محلياً
  ];

  return segments
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter((s) => s.length > 0)
    .join("/");
}

/** معاينة المسار المُنتج (تُستخدم في الإعدادات) */
export function previewPath(config: AppConfig, grade = "الأول الابتدائي", term = "الترم الأول"): string {
  const fname = buildFileName(1, config);
  return buildStoragePath(fname, { grade, term }, config);
}
