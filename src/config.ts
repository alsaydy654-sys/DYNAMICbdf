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

export function buildFileName(index: number, config: AppConfig): string {
  const padded = padIndex(index, config.zeroPadDigits);
  const prefix = config.customPrefix || "";
  const ext = extensionFor(config.imageFormat);
  return `${prefix}${padded}.${ext}`;
}

/**
 * Build the full storage path by combining:
 *   <basePath>/<grade>/<term>/<fileName>
 * Segments are cleaned of leading/trailing slashes and empty parts dropped,
 * so a blank basePath still yields a valid grade/term/filename path.
 */
export function buildStoragePath(
  pageFileName: string,
  context: { grade: string; term: string },
  config: AppConfig
): string {
  const segments = [config.basePath, context.grade, context.term, pageFileName];
  return segments
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter((s) => s.length > 0)
    .join("/");
}

/** Live preview of the generated path for the first page (used in Settings). */
export function previewPath(config: AppConfig, grade = "الأول الابتدائي", term = "الترم الأول"): string {
  const fname = buildFileName(1, config);
  return buildStoragePath(fname, { grade, term }, config);
}
