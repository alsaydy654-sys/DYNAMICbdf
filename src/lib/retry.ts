export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onAttemptFailed?: (attempt: number, attempts: number, error: Error, delayMs: number) => void;
}

const TRANSIENT_PATTERNS = [
  /failed to fetch/i,
  /network/i,
  /networkerror/i,
  /load failed/i,
  /timeout/i,
  /timed out/i,
  /aborted/i,
  /socket/i,
  /connection/i,
  /ecconnreset/i,
  /econnreset/i,
  /temporarily unavailable/i,
  /too many requests/i,
  /\b(408|425|429|500|502|503|504)\b/,
];

/** Errors worth retrying: connectivity blips and server-side throttling. */
export function isTransientError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERNS.some((re) => re.test(message));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until the browser reports connectivity again (bounded by timeoutMs). */
export async function waitForOnline(timeoutMs = 60_000): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener("online", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    window.addEventListener("online", done);
  });
}

/**
 * Run `task` with exponential backoff + jitter, retrying only transient errors.
 * Waits for connectivity to return before each retry when the browser is offline.
 */
export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 800;
  const maxDelayMs = options.maxDelayMs ?? 15_000;

  let lastError: Error = new Error("Retry failed without an error");

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task(attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === attempts || !isTransientError(lastError)) throw lastError;

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(backoff * (0.5 + Math.random() * 0.5));
      options.onAttemptFailed?.(attempt, attempts, lastError, delayMs);
      await waitForOnline();
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Reject with a transient timeout error if `promise` outlives `timeoutMs`.
 * The underlying request may keep running; callers must be idempotent.
 */
export function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)),
      timeoutMs
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}
