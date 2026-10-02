import { createHash } from "crypto";
import OpenAI from "openai";
import {
  buildOpenAIStructuredResponseRequestBody,
  estimateOpenAICostUsd,
  extractOutputText,
  extractRefusal,
  getPackageVersion,
  responseFailureDetails,
} from "../agent-backend/openai/shared";
import {
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  type FixedEnvironmentBinding,
} from "../context/fixed-environment-runtime";
import {
  P6_3_RSEM_OUTPUT_INSTRUCTIONS,
  P6_3_RSEM_PROVIDER_CONTRACT,
  P6_3_RSEM_SCHEMA_VERSION,
} from "./p6-3-rsem-protocol-parity";
import {
  buildP63V3RSemRequestBody,
  P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256,
  P6_3_V3_RSEM_PROMPT_VERSION,
} from "./p6-3-v3-rsem-executor";
import type {
  P63V3RSemReliabilityAuditCandidateCap,
  P63V3RSemReliabilityAuditDisposition,
} from "./p6-3-v3-rsem-reliability-audit-spec";

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION =
  "p6-3-v3-rsem-reliability-audit-executor-v1" as const;

export interface P63V3RSemReliabilityAuditProbe {
  readonly probeId: string;
  readonly prompt: string;
}

export interface P63V3RSemReliabilityAuditClient {
  responses: { create(body: any): Promise<any> };
}

export type P63V3RSemReliabilityAuditClientFactory =
  (options: { timeout: number; maxRetries: number }) =>
    P63V3RSemReliabilityAuditClient;

const defaultClientFactory: P63V3RSemReliabilityAuditClientFactory =
  (options) => new OpenAI(options) as P63V3RSemReliabilityAuditClient;

export interface P63V3RSemReliabilityAuditExecutorDecision {
  readonly disposition: P63V3RSemReliabilityAuditDisposition;
  readonly responseStatus: string | null;
  readonly incompleteReason: string | null;
  readonly configuredMaxOutputTokens: P63V3RSemReliabilityAuditCandidateCap;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
  readonly totalTokens: number;
  readonly structureValid: boolean | null;
  readonly estimatedCostUsd: number | null;
  readonly actualModel: string | null;
  readonly responseId: string | null;
  readonly providerErrorCode: string | null;
  readonly failureReason: string | null;
}

export interface P63V3RSemReliabilityAuditExecutorArtifact {
  readonly executorVersion: typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION;
  readonly v3PromptVersion: typeof P6_3_V3_RSEM_PROMPT_VERSION;
  readonly v3OutputInstructionsSha256: typeof P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256;
  readonly historicalOutputInstructionsSha256: string;
  readonly requestBodySha256: string;
  readonly fixedEnvironmentIdentity: string;
  readonly fixedEnvironment: ReturnType<typeof fixedEnvironmentLogSnapshot>;
  readonly rawResponse: string;
  readonly decision: P63V3RSemReliabilityAuditExecutorDecision;
  readonly sdkVersion: string | null;
}

export interface P63V3RSemReliabilityAuditExecutorOutcome {
  readonly decision: P63V3RSemReliabilityAuditExecutorDecision;
  readonly artifact: P63V3RSemReliabilityAuditExecutorArtifact;
}

export function buildP63V3RSemReliabilityAuditRequestBody(args: {
  contextFiles: Readonly<Record<string, string>>;
  probes: readonly P63V3RSemReliabilityAuditProbe[];
  fixedEnvironment: Readonly<FixedEnvironmentBinding>;
  maxOutputTokens: P63V3RSemReliabilityAuditCandidateCap;
}): Record<string, unknown> {
  const historicalBody = buildOpenAIStructuredResponseRequestBody({
    options: {
      model: P6_3_RSEM_PROVIDER_CONTRACT.model,
      reasoningEffort: P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort,
      maxOutputTokens: args.maxOutputTokens,
      storeResponses: P6_3_RSEM_PROVIDER_CONTRACT.storeResponses,
      serviceTier: P6_3_RSEM_PROVIDER_CONTRACT.serviceTier,
      promptCacheMode: P6_3_RSEM_PROVIDER_CONTRACT.promptCacheMode,
    },
    responseInput: [{
      role: "user",
      content: buildAuditProbePrompt(args.contextFiles, args.probes),
    }],
    outputSpec: {
      instructions: P6_3_RSEM_OUTPUT_INSTRUCTIONS,
      schemaName: P6_3_RSEM_SCHEMA_VERSION.replace(/-/g, "_"),
      schema: buildAuditProbeSchema(args.probes),
    },
  });
  return buildP63V3RSemRequestBody(historicalBody, args.fixedEnvironment);
}

function buildAuditProbePrompt(
  contextFiles: Readonly<Record<string, string>>,
  probes: readonly P63V3RSemReliabilityAuditProbe[]
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

function buildAuditProbeSchema(
  probes: readonly P63V3RSemReliabilityAuditProbe[]
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

export async function executeP63V3RSemReliabilityAuditAttempt(
  args: {
    contextFiles: Readonly<Record<string, string>>;
    probes: readonly P63V3RSemReliabilityAuditProbe[];
    fixedEnvironment: Readonly<FixedEnvironmentBinding>;
    maxOutputTokens: P63V3RSemReliabilityAuditCandidateCap;
  },
  clientFactory: P63V3RSemReliabilityAuditClientFactory = defaultClientFactory
): Promise<P63V3RSemReliabilityAuditExecutorOutcome> {
  const body = buildP63V3RSemReliabilityAuditRequestBody(args);
  const requestBodySha256 = sha256(stableJson(body));
  const environmentIdentity = fixedEnvironmentIdentity(args.fixedEnvironment);

  let response: any | null = null;
  let rawResponse = "";
  let decision: P63V3RSemReliabilityAuditExecutorDecision;

  try {
    const client = clientFactory({
      timeout: P6_3_RSEM_PROVIDER_CONTRACT.requestTimeoutMs,
      maxRetries: P6_3_RSEM_PROVIDER_CONTRACT.providerMaxRetries,
    });
    response = await client.responses.create(body as any);
    rawResponse = extractOutputText(response);

    const failure = responseFailureDetails(response);
    const refusal = extractRefusal(response);
    const inputTokens = response?.usage?.input_tokens ?? 0;
    const outputTokens = response?.usage?.output_tokens ?? 0;
    const reasoningOutputTokens =
      response?.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    const totalTokens = response?.usage?.total_tokens ?? inputTokens + outputTokens;
    const estimatedCostUsd = estimateOpenAICostUsd(
      P6_3_RSEM_PROVIDER_CONTRACT.model,
      response?.usage,
      "sync"
    );
    const actualModel = typeof response?.model === "string" ? response.model : null;
    const responseId = typeof response?.id === "string" ? response.id : null;
    const responseStatus = typeof response?.status === "string" ? response.status : null;

    const exactCapCensoring =
      responseStatus !== "completed" &&
      failure.incompleteReason === "max_output_tokens" &&
      outputTokens === args.maxOutputTokens;

    if (exactCapCensoring) {
      decision = {
        disposition: "cap-censored",
        responseStatus,
        incompleteReason: failure.incompleteReason,
        configuredMaxOutputTokens: args.maxOutputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
        structureValid: null,
        estimatedCostUsd,
        actualModel,
        responseId,
        providerErrorCode: failure.providerErrorCode,
        failureReason: "exact-cap-max_output_tokens",
      };
    } else if (refusal !== null || responseStatus !== "completed") {
      decision = {
        disposition: "non-cap-infrastructure",
        responseStatus,
        incompleteReason: failure.incompleteReason,
        configuredMaxOutputTokens: args.maxOutputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
        structureValid: null,
        estimatedCostUsd,
        actualModel,
        responseId,
        providerErrorCode: failure.providerErrorCode,
        failureReason:
          refusal ??
          failure.providerErrorMessage ??
          failure.incompleteReason ??
          `response-status-${String(responseStatus)}`,
      };
    } else if (actualModel !== P6_3_RSEM_PROVIDER_CONTRACT.model) {
      decision = {
        disposition: "protocol-invalid",
        responseStatus,
        incompleteReason: null,
        configuredMaxOutputTokens: args.maxOutputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
        structureValid: null,
        estimatedCostUsd,
        actualModel,
        responseId,
        providerErrorCode: failure.providerErrorCode,
        failureReason:
          `model-drift:${String(actualModel)}!=${P6_3_RSEM_PROVIDER_CONTRACT.model}`,
      };
    } else {
      const structure = validateBooleanProbeStructure(rawResponse, args.probes);
      decision = {
        disposition: structure.ok ? "valid-audit-trial" : "protocol-invalid",
        responseStatus,
        incompleteReason: null,
        configuredMaxOutputTokens: args.maxOutputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
        structureValid: structure.ok,
        estimatedCostUsd,
        actualModel,
        responseId,
        providerErrorCode: failure.providerErrorCode,
        failureReason: structure.ok ? null : structure.error,
      };
    }
  } catch (error) {
    const providerErrorCode =
      typeof (error as any)?.code === "string" ? (error as any).code : null;
    decision = {
      disposition: "non-cap-infrastructure",
      responseStatus: "provider-error",
      incompleteReason: null,
      configuredMaxOutputTokens: args.maxOutputTokens,
      inputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      structureValid: null,
      estimatedCostUsd: null,
      actualModel: null,
      responseId: null,
      providerErrorCode,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }

  const artifact: P63V3RSemReliabilityAuditExecutorArtifact = Object.freeze({
    executorVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION,
    v3PromptVersion: P6_3_V3_RSEM_PROMPT_VERSION,
    v3OutputInstructionsSha256: P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256,
    historicalOutputInstructionsSha256: sha256(P6_3_RSEM_OUTPUT_INSTRUCTIONS),
    requestBodySha256,
    fixedEnvironmentIdentity: environmentIdentity,
    fixedEnvironment: fixedEnvironmentLogSnapshot(args.fixedEnvironment),
    rawResponse,
    decision: Object.freeze({ ...decision }),
    sdkVersion: getPackageVersion("openai"),
  });

  return Object.freeze({
    decision: artifact.decision,
    artifact,
  });
}

function validateBooleanProbeStructure(
  rawResponse: string,
  probes: readonly P63V3RSemReliabilityAuditProbe[]
): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (error) {
    return {
      ok: false,
      error: `Invalid structured JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Structured output must be an object" };
  }
  const record = parsed as Record<string, unknown>;
  const expected = probes.map((probe) => probe.probeId).sort();
  const actual = Object.keys(record).sort();
  if (stableJson(actual) !== stableJson(expected)) {
    return { ok: false, error: "Structured output probe ID set mismatch" };
  }
  for (const probeId of expected) {
    if (record[probeId] !== "true" && record[probeId] !== "false") {
      return {
        ok: false,
        error: `Structured output answer is not forced-choice boolean text: ${probeId}`,
      };
    }
  }
  return { ok: true };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
