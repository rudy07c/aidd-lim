import { getEncoding } from "js-tiktoken";

/**
 * Stage 1 canonical artifact/history tokenizer.
 *
 * GPT-5-family models use the o200k_base encoding family. We freeze the encoding
 * explicitly instead of relying on a model-name lookup so future aliases/model
 * registry changes cannot silently change experimental budgets.
 *
 * Provider-reported request usage remains a separate measurement because it also
 * includes prompt framing/tool schemas and other transport-level input.
 */
export const CANONICAL_TOKEN_ENCODING = "o200k_base" as const;
export const CANONICAL_TOKEN_COUNT_METHOD = "js-tiktoken:o200k_base:v1" as const;

const encoding = getEncoding(CANONICAL_TOKEN_ENCODING);

export function countCanonicalTokens(text: string): number {
  return encoding.encode(text).length;
}

/** Content-only artifact accounting. Paths/framing are logged separately when relevant. */
export function countCanonicalFileContentTokens(files: Record<string, string>): number {
  return Object.values(files).reduce((sum, content) => sum + countCanonicalTokens(content), 0);
}

/** Useful when the exact serialized evidence, including keys/framing, is the measured object. */
export function countCanonicalSerializedTokens(value: unknown): number {
  return countCanonicalTokens(stableStringify(value));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = sortForStableJson((value as Record<string, unknown>)[key]);
  }
  return result;
}
