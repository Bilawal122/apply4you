import { AsyncLocalStorage } from "node:async_hooks";
import { GoogleGenAI } from "@google/genai";

export const MODELS = {
  /** Batched field resolution, match reasons, short free text. */
  lite: "gemini-2.5-flash-lite",
  /** Resume parsing, cover letters, fallback for low-confidence lite output. */
  flash: "gemini-2.5-flash",
  /** Matching embeddings; used with outputDimensionality 1536 (pgvector HNSW limit). */
  embedding: "gemini-embedding-001",
} as const;

export const EMBEDDING_DIMS = 1536;

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * Approximate USD price per 1M tokens, as of early 2026. These drift — update
 * the table rather than the math. Cost figures are estimates for the "cost per
 * application" metric, not billing.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

export interface UsageEvent {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  /** Who the call was made for. Null for genuinely user-less work (job embeds). */
  userId?: string;
}

/**
 * Who the current AI call is being made for.
 *
 * The usage sink is registered once per runtime and cannot know which user a
 * call belongs to, so every one of the 23,901 ai_usage rows written before this
 * had user_id NULL — which made D6's "cost per application (<$0.02 watch line)"
 * measurable only in global aggregate, never per user or per application.
 *
 * AsyncLocalStorage rather than a parameter on every AI function: the call
 * sites are processors and server actions that already know the user, while the
 * ~10 functions in between (tailorCv, generateCoverLetter, resolveFieldsWithLlm,
 * …) have no business taking a userId they only forward. It is also correct
 * under concurrency, which a module-level "current user" would not be — the
 * worker runs several jobs at once.
 */
const usageContext = new AsyncLocalStorage<{ userId: string }>();

/** Attribute every AI call made inside `fn` to `userId`. */
export function withUsageUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return usageContext.run({ userId }, fn);
}

type UsageSink = (event: UsageEvent) => void;
let usageSink: UsageSink | null = null;

/** Register where usage events go (worker/web write them to the ai_usage table). */
export function setUsageSink(sink: UsageSink | null): void {
  usageSink = sink;
}

interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
}

/** Records token usage + an estimated cost for one AI call. Never throws. */
export function logUsage(operation: string, model: string, usage: UsageMetadata | undefined): void {
  if (!usage || !usageSink) return;
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const cachedTokens = usage.cachedContentTokenCount ?? 0;
  const price = PRICING[model] ?? { input: 0, output: 0 };
  const estimatedCostUsd = (inputTokens / 1e6) * price.input + (outputTokens / 1e6) * price.output;
  try {
    usageSink({
      operation,
      model,
      inputTokens,
      outputTokens,
      cachedTokens,
      estimatedCostUsd,
      userId: usageContext.getStore()?.userId,
    });
  } catch {
    // Cost logging must never break an AI call.
  }
}

/**
 * Hard ceiling on a single model call.
 *
 * The SDK has no default timeout, so a stalled request hangs forever and takes
 * its caller with it. That is how a profile save died: a flash call inside a
 * Server Action outlived the platform's function limit, and the user got a
 * button stuck on "Saving…". A worker job would hang just as silently.
 *
 * Generous enough that a normal flash call (12-20s observed) never trips it.
 */
export const CALL_TIMEOUT_MS = 45_000;

export async function withTimeout<T>(fn: () => Promise<T>, ms = CALL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`model call exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Retry with exponential backoff on 429/5xx. Each attempt is time-bounded. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(message);
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 2 ** i * 1000 + Math.random() * 500));
    }
  }
  throw lastError;
}
