/** Structured lifecycle phases emitted by live extraction and capture runs. */
export type ProgressPhase =
  | "run"
  | "browser"
  | "discovery"
  | "viewport"
  | "assets"
  | "animations"
  | "stack"
  | "icons"
  | "topology"
  | "interaction"
  | "tokens"
  | "screenshot";

export type ProgressStatus = "started" | "completed" | "skipped" | "failed";

export type ProgressDetail = Record<string, string | number | boolean>;

/** One machine-readable progress update. UI copy and icons belong to the caller. */
export interface ProgressEvent {
  phase: ProgressPhase;
  status: ProgressStatus;
  url?: string;
  breakpoint?: number;
  current?: number;
  total?: number;
  elapsedMs?: number;
  detail?: ProgressDetail;
  error?: string;
}

/**
 * Synchronous observer for progress updates. Listener errors are ignored so
 * presentation/telemetry cannot abort an otherwise successful extraction.
 */
export type ProgressListener = (event: ProgressEvent) => void;

interface ProgressContext {
  phase: ProgressPhase;
  url?: string;
  breakpoint?: number;
  current?: number;
  total?: number;
  detail?: ProgressDetail;
}

export function emitProgress(
  listener: ProgressListener | undefined,
  event: ProgressEvent,
): void {
  try {
    const result = listener?.(event) as unknown;
    if (
      result !== null &&
      typeof result === "object" &&
      "then" in result &&
      typeof result.then === "function"
    ) {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // ponytail: progress is observational; add an error hook if callers need diagnostics.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Emit a started/completed/failed lifecycle around one real unit of work. */
export async function withProgressPhase<T>(
  listener: ProgressListener | undefined,
  context: ProgressContext,
  action: () => T | Promise<T>,
  completedDetail?: (result: T) => ProgressDetail | undefined,
): Promise<T> {
  const startedAt = Date.now();
  emitProgress(listener, { ...context, status: "started" });

  try {
    const result = await action();
    const extraDetail = completedDetail?.(result);
    const detail =
      context.detail || extraDetail
        ? { ...context.detail, ...extraDetail }
        : undefined;
    emitProgress(listener, {
      ...context,
      status: "completed",
      elapsedMs: Date.now() - startedAt,
      detail,
    });
    return result;
  } catch (error) {
    emitProgress(listener, {
      ...context,
      status: "failed",
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error),
    });
    throw error;
  }
}
