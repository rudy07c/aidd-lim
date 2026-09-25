import * as path from "path";

export const P6_3_MUTATION_PROTOCOL_PARITY_VERSION =
  "p6-3-mutation-protocol-parity-v1" as const;
export const P6_3_MUTATION_PARSER_BEHAVIOR_VERSION =
  "p6-3-p62-compatible-mutation-parser-behavior-v1" as const;
export const P6_3_MUTATION_PATH_VALIDATION_VERSION =
  "p6-3-p62-compatible-mutation-path-validation-v1" as const;
export const P6_3_MUTATION_FAILURE_CLASSIFICATION_BEHAVIOR_VERSION =
  "p6-3-p62-compatible-failure-classification-behavior-v1" as const;

/**
 * Exact P6-2 mutation-call execution settings that P6-3 M arms must inherit.
 * Scientific-cell replacement remains a separate P6-3 execution-protocol rule.
 */
export const P6_3_MUTATION_PROVIDER_CONTRACT = Object.freeze({
  model: "gpt-5.6-luna",
  reasoningEffort: "high",
  maxOutputTokens: 7000,
  requestTimeoutMs: 180000,
  providerMaxRetries: 2,
  serviceTier: "default",
  promptCacheMode: "implicit",
  storeResponses: false,
  maxToolRounds: 0,
} as const);

/**
 * P6-2-compatible repository-write contract copied without semantic change from
 * the P6-2 AF baseline runner. P6-3 live M execution must call this shared
 * contract rather than introducing an EL-only validator.
 */
export function validateP63MutationPathsP62Compatible(
  files: Readonly<Record<string, string>>
): string | null {
  for (const raw of Object.keys(files)) {
    const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
    if (
      path.posix.isAbsolute(normalized) ||
      normalized === ".." ||
      normalized.startsWith("../")
    ) {
      return `write-escape:${raw}`;
    }
    if (!(normalized.startsWith("src/") || normalized.startsWith("tests/"))) {
      return `write-outside-repository-contract:${raw}`;
    }
  }
  return null;
}
