import * as assert from "assert";
import type { AgentBackend, AgentResult } from "./src/agent-backend/types";
import type { OpenAIBackendOptions } from "./src/agent-backend/openai";
import {
  executeP63V2MCell,
  executeP63V2RSemCell,
} from "./src/p6/p6-3-v2-live-executors";
import {
  P6_3_V2_MUTATION_PROVIDER_CONTRACT,
  P6_3_V2_RSEM_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-v2-execution-parameters";

async function main(): Promise<void> {
  await verifyMutationExactCapEvidenceAndContract();
  await verifyMutationScientificFailureHasNoAutoInfraEvidence();
  await verifyMutationProviderErrorDoesNotInventZeroUsage();
  await verifyRSemExactCapEvidenceAndContract();
  await verifyRSemAmbiguousIncompleteReasonFailsClosed();
  await verifyRSemProviderErrorDoesNotInventZeroUsage();
  console.log("P6-3 v2 live executor adapter offline verification passed");
}

async function verifyMutationExactCapEvidenceAndContract(): Promise<void> {
  let captured: OpenAIBackendOptions | null = null;
  const agent = fakeAgent({
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: 14000,
    reasoningOutputTokens: 13234,
    errorCategory: "response",
    responseId: "resp-offline",
  });
  const outcome = await executeP63V2MCell({
    contextFiles: { "src/a.ts": "export const a = 1;" },
    evaluationRepository: { "src/a.ts": "export const a = 1;" },
    syntheticWorldDir: "/unused-offline",
    task: { taskId: "T-offline", visibleInstruction: "offline" },
    repeat: 1,
    contextBudget: 505,
    exposure: exposure(505),
    backendFactory: (options) => {
      captured = options;
      return fakeBackend(agent);
    },
  });

  assert.deepEqual(captured, {
    model: P6_3_V2_MUTATION_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_V2_MUTATION_PROVIDER_CONTRACT.reasoningEffort,
    maxOutputTokens: 14000,
    requestTimeoutMs: 180000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 0,
    serviceTier: "default",
    promptCacheMode: "implicit",
  });
  assert.equal(outcome.failureDomain, "infrastructure");
  assert.deepEqual(outcome.autoInfrastructureEvidence, {
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: 14000,
    configuredMaxOutputTokens: 14000,
    responseStatus: "incomplete",
    providerErrorCode: null,
    errorCategory: "response",
  });
  assert.deepEqual(outcome.reliabilityTelemetry, {
    tokenUsage: { input: 321, output: 14000, reasoningOutput: 13234, total: 14321 },
    configuredMaxOutputTokens: 14000,
    incompleteReason: "max_output_tokens",
  });
}

async function verifyMutationScientificFailureHasNoAutoInfraEvidence(): Promise<void> {
  const agent = fakeAgent({
    executionStatus: "output-parse-failure",
    incompleteReason: null,
    outputTokens: 88,
    reasoningOutputTokens: 17,
    errorCategory: "output-parse",
    responseId: "resp-offline",
  });
  const outcome = await executeP63V2MCell({
    contextFiles: {},
    evaluationRepository: {},
    syntheticWorldDir: "/unused-offline",
    task: { taskId: "T-offline", visibleInstruction: "offline" },
    repeat: 1,
    contextBudget: 0,
    exposure: exposure(0),
    backendFactory: () => fakeBackend(agent),
  });
  assert.notEqual(outcome.failureDomain, "infrastructure");
  assert.equal(outcome.autoInfrastructureEvidence, null);
  assert.equal(outcome.reliabilityTelemetry.tokenUsage.output, 88);
}

async function verifyMutationProviderErrorDoesNotInventZeroUsage(): Promise<void> {
  const agent = fakeAgent({
    executionStatus: "provider-error",
    incompleteReason: null,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    errorCategory: "provider",
    responseId: null,
  });
  const outcome = await executeP63V2MCell({
    contextFiles: {},
    evaluationRepository: {},
    syntheticWorldDir: "/unused-offline",
    task: { taskId: "T-offline", visibleInstruction: "offline" },
    repeat: 1,
    contextBudget: 0,
    exposure: exposure(0),
    backendFactory: () => fakeBackend(agent),
  });
  assert.equal(outcome.failureDomain, "infrastructure");
  assert.equal(outcome.autoInfrastructureEvidence?.outputTokens, null);
  assert.deepEqual(outcome.reliabilityTelemetry.tokenUsage, {
    input: null,
    output: null,
    reasoningOutput: null,
    total: null,
  });
}

async function verifyRSemExactCapEvidenceAndContract(): Promise<void> {
  const result: any = rsemResult({
    executionStatus: "response-incomplete",
    failureReason: "max_output_tokens",
    responseId: "resp-rsem",
    output: 8000,
    reasoning: 7400,
  });
  const outcome = await executeP63V2RSemCell({
    contextFiles: { "src/a.ts": "x" },
    probes: [],
    repeat: 2,
    exposure: exposure(505),
    rsemRunner: async () => result,
  });
  assert.equal(P6_3_V2_RSEM_PROVIDER_CONTRACT.maxOutputTokens, 8000);
  assert.equal(outcome.failureDomain, "infrastructure");
  assert.deepEqual(outcome.autoInfrastructureEvidence, {
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
    outputTokens: 8000,
    configuredMaxOutputTokens: 8000,
    responseStatus: "incomplete",
    providerErrorCode: null,
    errorCategory: "response",
  });
  assert.equal(outcome.reliabilityTelemetry.tokenUsage.output, 8000);
  assert.equal(outcome.reliabilityTelemetry.tokenUsage.reasoningOutput, 7400);
}

async function verifyRSemAmbiguousIncompleteReasonFailsClosed(): Promise<void> {
  const result: any = rsemResult({
    executionStatus: "response-incomplete",
    failureReason: "provider returned an opaque incomplete response",
    responseId: "resp-opaque",
    output: 700,
    reasoning: 600,
  });
  const outcome = await executeP63V2RSemCell({
    contextFiles: {},
    probes: [],
    repeat: 1,
    exposure: exposure(0),
    rsemRunner: async () => result,
  });
  assert.equal(outcome.reliabilityTelemetry.incompleteReason, null);
  assert.equal(outcome.autoInfrastructureEvidence?.incompleteReason, null);
  assert.equal(outcome.autoInfrastructureEvidence?.outputTokens, 700);
}

async function verifyRSemProviderErrorDoesNotInventZeroUsage(): Promise<void> {
  const result: any = rsemResult({
    executionStatus: "provider-error",
    failureReason: "network failure",
    responseId: null,
    output: 0,
    reasoning: 0,
  });
  result.modelProvenance.responseStatus = "provider-error";
  const outcome = await executeP63V2RSemCell({
    contextFiles: {},
    probes: [],
    repeat: 1,
    exposure: exposure(0),
    rsemRunner: async () => result,
  });
  assert.equal(outcome.failureDomain, "infrastructure");
  assert.equal(outcome.autoInfrastructureEvidence?.outputTokens, null);
  assert.deepEqual(outcome.reliabilityTelemetry.tokenUsage, {
    input: null,
    output: null,
    reasoningOutput: null,
    total: null,
  });
}

function fakeBackend(result: AgentResult): AgentBackend {
  return { run: async () => result };
}

function fakeAgent(args: {
  executionStatus: AgentResult["executionStatus"];
  incompleteReason: string | null;
  outputTokens: number;
  reasoningOutputTokens: number;
  errorCategory: "provider" | "tool" | "output-parse" | "response";
  responseId: string | null;
}): AgentResult {
  return {
    modifiedFiles: {},
    rawResponse: args.executionStatus === "output-parse-failure" ? "not-json" : "",
    observableAssistantMessages: [],
    explicitWorkingNote: null,
    toolEvents: [],
    tokenUsage: {
      input: 321,
      output: args.outputTokens,
      reasoningOutput: args.reasoningOutputTokens,
      total: args.outputTokens + 321,
    },
    latencyMs: 1,
    executionStatus: args.executionStatus,
    modelProvenance: {
      provider: "openai",
      requestedModel: "gpt-5.6-luna",
      actualModel: args.responseId ? "gpt-5.6-luna" : null,
      responseId: args.responseId,
      responseStatus: args.executionStatus === "response-incomplete"
        ? "incomplete"
        : args.executionStatus === "provider-error" ? "provider-error" : "completed",
      endpoint: "responses",
      reasoningEffort: "high",
      maxOutputTokens: 14000,
      structuredOutput: true,
      storeResponses: false,
      requestedServiceTier: "default",
      actualServiceTier: args.responseId ? "default" : null,
      promptCacheMode: "implicit",
      promptVersion: "offline",
      promptHash: "offline",
      schemaVersion: "offline",
      schemaHash: "offline",
      pricingMode: "sync",
      continuationState: "none",
      incompleteReason: args.incompleteReason,
      refusal: null,
      providerErrorCode: args.executionStatus === "provider-error" ? "offline-provider" : null,
      sdkVersion: "offline",
      retryPolicy: { maxRetries: 2, timeoutMs: 180000 },
    },
    estimatedCostUsd: args.responseId ? 0.01 : null,
    error: {
      category: args.errorCategory,
      message: args.incompleteReason ?? args.executionStatus,
      retryable: false,
    },
  };
}

function rsemResult(args: {
  executionStatus: string;
  failureReason: string;
  responseId: string | null;
  output: number;
  reasoning: number;
}) {
  return {
    repeat: 1,
    designVersion: "stage1-neutral-relation-v2",
    executionStatus: args.executionStatus,
    validity: "infrastructure-invalid",
    failureDomain: "infrastructure",
    rawFailureDomain: "infrastructure",
    adjudication: null,
    protocolValid: null,
    failureReason: args.failureReason,
    rawResponse: "",
    modelProvenance: {
      provider: "openai",
      requestedModel: "gpt-5.6-luna",
      actualModel: args.responseId ? "gpt-5.6-luna" : null,
      responseId: args.responseId,
      responseStatus: args.executionStatus === "response-incomplete" ? "incomplete" : "provider-error",
      reasoningEffort: "high",
      providerErrorCode: null,
    },
    booleanCorrect: null,
    booleanTotal: 12,
    booleanAccuracy: null,
    probeDetails: [],
    actualModel: args.responseId ? "gpt-5.6-luna" : null,
    usage: { input: 222, output: args.output, reasoningOutput: args.reasoning, total: args.output + 222 },
    estimatedCostUsd: args.responseId ? 0.01 : null,
  };
}

function exposure(budget: number) {
  return {
    mode: "EL-static" as const,
    budgetTokens: budget,
    actualExposedTokens: budget,
    fullRepositoryTokens: 4046,
    staticPayloadHash: `offline-${budget}`,
    exposureSetHash: `set-${budget}`,
    selectorPlanHash: `plan-${budget}`,
    selectedUnitCount: budget === 0 ? 0 : 1,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
