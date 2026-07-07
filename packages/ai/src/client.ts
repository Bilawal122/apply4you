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

/** Retry with exponential backoff on 429/5xx. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
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
