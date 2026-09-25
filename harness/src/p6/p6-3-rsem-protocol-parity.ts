import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import { scoreProbes } from "../../../calibration/src/probe-scorer";

export const P6_3_RSEM_PROTOCOL_PARITY_VERSION =
  "p6-3-rsem-protocol-parity-v1" as const;
export const P6_3_RSEM_PROMPT_VERSION = "p6-2-af-probe-prompt-v1" as const;
export const P6_3_RSEM_SCHEMA_VERSION = "p6-2-af-boolean-answers-v1" as const;
export const P6_3_RSEM_DESIGN_VERSION = "stage1-neutral-relation-v2" as const;
export const P6_3_RSEM_PARSER_BEHAVIOR_VERSION =
  "p6-3-p62-compatible-rsem-parser-v1" as const;
export const P6_3_RSEM_FAILURE_SEMANTICS_VERSION =
  "p6-3-p62-compatible-rsem-failure-semantics-v1" as const;

export const P6_3_RSEM_OUTPUT_INSTRUCTIONS =
  "Answer semantic probes about the supplied TypeScript repository. Use only supplied repository evidence. If evidence is absent, make the best forced-choice answer rather than claiming hidden knowledge." as const;

/** Exact provider/request settings inherited from the P6-2 Rsem AF baseline. */
export const P6_3_RSEM_PROVIDER_CONTRACT = Object.freeze({
  model: "gpt-5.6-luna",
  reasoningEffort: "high",
  maxOutputTokens: 8000,
  requestTimeoutMs: 180000,
  providerMaxRetries: 2,
  serviceTier: "default",
  promptCacheMode: "implicit",
  storeResponses: false,
  executionMode: "sync",
} as const);

/**
 * P6-2-compatible Rsem prompt. The only arm-dependent input is contextFiles.
 * Probe answer/provenance fields are intentionally never read.
 */
export function buildP63RSemPromptP62Compatible(
  contextFiles: Readonly<Record<string, string>>,
  probes: readonly GeneratedProbe[]
): string {
  const repo = Object.keys(contextFiles)
    .sort()
    .map((filePath) => `\n--- ${filePath} ---\n${contextFiles[filePath]}`)
    .join("");
  const questions = probes
    .map((probe) => [
      `[${probe.probeId}] (boolean)`,
      probe.prompt,
      'Answer exactly "true" or "false".',
    ].join("\n"))
    .join("\n\n");
  return `REPOSITORY FILES:${repo}\n\nQUESTIONS:\n${questions}\n\nReturn one string answer for every exact probe ID.`;
}

/** Exact P6-2 response schema shape for the supplied frozen probe bank. */
export function buildP63RSemSchemaP62Compatible(
  probes: readonly GeneratedProbe[]
): {
  type: "object";
  properties: Record<string, { type: "string" }>;
  required: string[];
  additionalProperties: false;
} {
  return {
    type: "object",
    properties: Object.fromEntries(
      probes.map((probe) => [probe.probeId, { type: "string" as const }])
    ),
    required: probes.map((probe) => probe.probeId),
    additionalProperties: false,
  };
}

export type P63RSemParseOutcome =
  | "ok"
  | "output-parse-failure"
  | "answer-protocol-failure";

export interface P63RSemParsedResult {
  outcome: P63RSemParseOutcome;
  protocolValid: boolean;
  booleanCorrect: number | null;
  booleanTotal: number;
  failureReason: string | null;
  probeDetails: Array<{
    probeId: string;
    correct: boolean;
    agentAnswer: string;
    correctAnswer: string;
    parseError?: string;
  }>;
}

/**
 * P6-2-compatible completed-response parser/scorer. Provider/refusal/status
 * failures remain runner-level outcomes and are frozen separately.
 */
export function parseP63RSemCompletedResponseP62Compatible(
  rawResponse: string,
  probes: readonly GeneratedProbe[]
): P63RSemParsedResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawResponse) as Record<string, unknown>;
  } catch (error) {
    return {
      outcome: "output-parse-failure",
      protocolValid: false,
      booleanCorrect: null,
      booleanTotal: probes.length,
      failureReason: `Invalid structured JSON: ${error instanceof Error ? error.message : String(error)}`,
      probeDetails: [],
    };
  }

  const answers = Object.fromEntries(
    probes.map((probe) => [probe.probeId, String(parsed[probe.probeId] ?? "")])
  );
  const scored = scoreProbes([...probes], answers);
  const probeDetails = scored.map((item) => ({
    probeId: item.probeId,
    correct: item.correct,
    agentAnswer: item.agentAnswer,
    correctAnswer: item.correctAnswer,
    parseError: item.parseError,
  }));
  const parseErrors = probeDetails.filter((item) => item.parseError);
  if (parseErrors.length > 0) {
    return {
      outcome: "answer-protocol-failure",
      protocolValid: false,
      booleanCorrect: null,
      booleanTotal: scored.length,
      failureReason: `Malformed forced-choice answer(s): ${parseErrors.map((item) => item.probeId).join(",")}`,
      probeDetails,
    };
  }

  const correct = scored.filter((item) => item.correct).length;
  return {
    outcome: "ok",
    protocolValid: true,
    booleanCorrect: correct,
    booleanTotal: scored.length,
    failureReason: null,
    probeDetails,
  };
}

export const P6_3_RSEM_FAILURE_SEMANTICS = Object.freeze([
  Object.freeze({
    id: "provider-error",
    validity: "infrastructure-invalid",
    failureDomain: "infrastructure",
    protocolValid: null,
  }),
  Object.freeze({
    id: "response-refusal",
    validity: "infrastructure-invalid",
    failureDomain: "infrastructure",
    protocolValid: null,
  }),
  Object.freeze({
    id: "response-incomplete",
    validity: "infrastructure-invalid",
    failureDomain: "infrastructure",
    protocolValid: null,
  }),
  Object.freeze({
    id: "response-failed",
    validity: "infrastructure-invalid",
    failureDomain: "infrastructure",
    protocolValid: null,
  }),
  Object.freeze({
    id: "response-not-completed",
    validity: "infrastructure-invalid",
    failureDomain: "infrastructure",
    protocolValid: null,
  }),
  Object.freeze({
    id: "output-parse-failure",
    validity: "valid",
    failureDomain: "protocol",
    protocolValid: false,
  }),
  Object.freeze({
    id: "probe-scoring-error",
    validity: "infrastructure-invalid",
    failureDomain: "system",
    protocolValid: null,
  }),
  Object.freeze({
    id: "answer-protocol-failure",
    validity: "valid",
    failureDomain: "protocol",
    protocolValid: false,
  }),
  Object.freeze({
    id: "ok",
    validity: "valid",
    failureDomain: "none",
    protocolValid: true,
  }),
] as const);
