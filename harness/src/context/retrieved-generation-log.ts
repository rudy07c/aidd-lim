import type { TokenUsage } from "../types";
import type { AgentRetrievedEpisodeResult } from "./agent-retrieved-episode";
import type { PrivilegedRetrievedEpisodeResult } from "./privileged-retrieved-episode";
import type { PrivilegedRetrievalPlan } from "./privileged-retrieval-controller";
import type {
  ResearchStatelessCondition,
  ResearchStatelessEpisodeTelemetry,
} from "./research-stateless-episode";
import {
  RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION,
  RetrievedEpisodeRuntimeFailure,
} from "./retrieved-episode-runtime";
import type { BudgetedRetrievalRecord } from "../repository/retrieval-gateway";

export const RETRIEVED_GENERATION_LOG_SCHEMA_VERSION =
  "retrieved-generation-log-v3-failure-aware" as const;
export const AGENT_RETRIEVAL_POLICY_VERSION = "agent-function-tools-v2-bounded-note" as const;

export interface RetrievedGenerationPolicyLog {
  source: "privileged-controller" | "agent-function-tools";
  version: string;
}

export interface RetrievedGenerationObservableStepLog {
  stepIndex: number;
  rawResponse: string;
  decision: unknown;
  explicitMemoryUpdate: string | null | undefined;
}

export interface RetrievedGenerationApiSummary {
  providerTelemetryComplete: boolean;
  providerCallsLogged: number;
  tokenUsage: TokenUsage | null;
  latencyMs: number | null;
  costUsd: number | null;
}

export interface RetrievedGenerationSummary {
  bWork: number;
  peakWorkingSetTokens: number;
  finalWorkingSetTokens: number;
  uniqueObservedUnitCount: number;
  uniqueObservedTokens: number;
  cumulativeAdmissionTokens: number;
  rereadCount: number;
  cumulativeRereadTokens: number;
  retrievalCount: number;
  failedRetrievalCount: number;
  totalRetrievedTokens: number;
  evictionCount: number;
  modelCalls: number;
  decisionRounds: number;
  tokenCountMethod: string;
  evictionPolicy: string;
  api: RetrievedGenerationApiSummary;
}

export interface RetrievedGenerationCompletion {
  status: "completed" | "failed";
  error: string | null;
}

export interface RetrievedGenerationLog {
  schemaVersion: typeof RETRIEVED_GENERATION_LOG_SCHEMA_VERSION;
  runtimeSchemaVersion: typeof RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION;
  condition: ResearchStatelessCondition;
  completion: RetrievedGenerationCompletion;
  retrievalPolicy: RetrievedGenerationPolicyLog;
  observableSteps: RetrievedGenerationObservableStepLog[];
  episode: ResearchStatelessEpisodeTelemetry;
  retrievals: BudgetedRetrievalRecord[];
  privilegedRetrievalPlan: PrivilegedRetrievalPlan | null;
  summary: RetrievedGenerationSummary;
}

export function buildAgentRetrievedGenerationLog<TFinal>(
  result: AgentRetrievedEpisodeResult<TFinal>
): RetrievedGenerationLog {
  return buildRetrievedGenerationLog({
    condition: "AR",
    completion: { status: "completed", error: null },
    policy: {
      source: "agent-function-tools",
      version: AGENT_RETRIEVAL_POLICY_VERSION,
    },
    observableSteps: result.observableSteps,
    episode: result.telemetry,
    retrievals: result.retrievals,
    privilegedRetrievalPlan: null,
  });
}

export function buildPrivilegedRetrievedGenerationLog<TFinal>(
  result: PrivilegedRetrievedEpisodeResult<TFinal>
): RetrievedGenerationLog {
  return buildRetrievedGenerationLog({
    condition: "PR",
    completion: { status: "completed", error: null },
    policy: {
      source: "privileged-controller",
      version: result.retrievalPlan.policyVersion,
    },
    observableSteps: result.observableSteps,
    episode: result.telemetry,
    retrievals: result.retrievals,
    privilegedRetrievalPlan: result.retrievalPlan,
  });
}

export function buildFailedAgentRetrievedGenerationLog(
  failure: RetrievedEpisodeRuntimeFailure<unknown>
): RetrievedGenerationLog {
  if (failure.condition !== "AR") {
    throw new Error(`Expected AR runtime failure, received ${failure.condition}`);
  }
  return buildRetrievedGenerationLog({
    condition: "AR",
    completion: { status: "failed", error: failure.message },
    policy: {
      source: "agent-function-tools",
      version: AGENT_RETRIEVAL_POLICY_VERSION,
    },
    observableSteps: failure.observableSteps,
    episode: failure.telemetry,
    retrievals: failure.retrievals,
    privilegedRetrievalPlan: null,
  });
}

export function buildFailedPrivilegedRetrievedGenerationLog(
  failure: RetrievedEpisodeRuntimeFailure<unknown>,
  retrievalPlan: PrivilegedRetrievalPlan
): RetrievedGenerationLog {
  if (failure.condition !== "PR") {
    throw new Error(`Expected PR runtime failure, received ${failure.condition}`);
  }
  return buildRetrievedGenerationLog({
    condition: "PR",
    completion: { status: "failed", error: failure.message },
    policy: {
      source: "privileged-controller",
      version: retrievalPlan.policyVersion,
    },
    observableSteps: failure.observableSteps,
    episode: failure.telemetry,
    retrievals: failure.retrievals,
    privilegedRetrievalPlan: retrievalPlan,
  });
}

function buildRetrievedGenerationLog(args: {
  condition: ResearchStatelessCondition;
  completion: RetrievedGenerationCompletion;
  policy: RetrievedGenerationPolicyLog;
  observableSteps: readonly RetrievedGenerationObservableStepLog[];
  episode: ResearchStatelessEpisodeTelemetry;
  retrievals: BudgetedRetrievalRecord[];
  privilegedRetrievalPlan: PrivilegedRetrievalPlan | null;
}): RetrievedGenerationLog {
  if (args.episode.condition !== args.condition) {
    throw new Error(
      `Retrieved generation log condition mismatch: ${args.episode.condition} != ${args.condition}`
    );
  }
  if (args.observableSteps.length !== args.episode.steps.length) {
    throw new Error(
      `Observable step/telemetry count mismatch: observable=${args.observableSteps.length}, telemetry=${args.episode.steps.length}`
    );
  }
  for (let index = 0; index < args.observableSteps.length; index++) {
    if (
      args.observableSteps[index].stepIndex !== index ||
      args.episode.steps[index].stepIndex !== index
    ) {
      throw new Error(`Research-stateless step index drift at ${index}`);
    }
  }
  if (args.episode.explorationBudget.pendingRetrieval !== null) {
    throw new Error("Cannot persist retrieved generation log with pending retrieval");
  }
  if (
    args.episode.explorationBudget.used.retrievalOperations !== args.retrievals.length
  ) {
    throw new Error(
      `Retrieval trace/accounting mismatch: records=${args.retrievals.length}, E_max=${args.episode.explorationBudget.used.retrievalOperations}`
    );
  }

  let exposedTokenSum = 0;
  let failedRetrievalCount = 0;
  for (let index = 0; index < args.retrievals.length; index++) {
    const record = args.retrievals[index];
    if (record.sequence !== index) {
      throw new Error(`Retrieval sequence drift at ${index}: ${record.sequence}`);
    }
    if (!record.request || typeof record.request !== "object") {
      throw new Error(`Retrieval ${index} is missing canonical request arguments`);
    }
    if (record.error === null) {
      if (record.phaseTrace.join(",") !== "begin,access,complete,admit") {
        throw new Error(
          `Successful retrieval ${index} has invalid phase trace: ${record.phaseTrace.join(",")}`
        );
      }
    } else {
      failedRetrievalCount += 1;
      const phases = record.phaseTrace.join(",");
      if (phases !== "begin,complete" && phases !== "begin,access,complete") {
        throw new Error(`Failed retrieval ${index} has invalid phase trace: ${phases}`);
      }
      if (record.exposedTokens !== 0 || record.admittedUnitIds.length !== 0) {
        throw new Error(`Failed retrieval ${index} exposed or admitted evidence`);
      }
    }
    exposedTokenSum += record.exposedTokens;
  }
  if (args.completion.status === "completed" && failedRetrievalCount > 0) {
    throw new Error("Completed retrieved episode cannot contain failed retrieval records");
  }
  if (args.completion.status === "failed" && !args.completion.error) {
    throw new Error("Failed retrieved generation log requires an error message");
  }
  if (
    exposedTokenSum !== args.episode.explorationBudget.used.cumulativeRetrievedTokens
  ) {
    throw new Error(
      `Retrieved evidence token accounting mismatch: trace=${exposedTokenSum}, E_max=${args.episode.explorationBudget.used.cumulativeRetrievedTokens}`
    );
  }

  const working = args.episode.workingSet;
  if (working.currentTokenUsage > working.budgetTokens) {
    throw new Error(
      `Cannot persist B_work violation: ${working.currentTokenUsage}/${working.budgetTokens}`
    );
  }
  const uniqueObservedTokens =
    working.cumulativeUnitAdmissionTokens - working.cumulativeRereadTokens;
  if (uniqueObservedTokens < 0) {
    throw new Error("Unique observed token accounting became negative");
  }

  const peakCandidates = [working.currentTokenUsage];
  for (const step of args.episode.steps) {
    peakCandidates.push(step.workingSetTokensBefore, step.workingSetTokensAfter);
  }
  for (const retrieval of args.retrievals) {
    peakCandidates.push(retrieval.workingSetTokensBefore, retrieval.workingSetTokensAfter);
  }

  return {
    schemaVersion: RETRIEVED_GENERATION_LOG_SCHEMA_VERSION,
    runtimeSchemaVersion: RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION,
    condition: args.condition,
    completion: { ...args.completion },
    retrievalPolicy: { ...args.policy },
    observableSteps: cloneJson(args.observableSteps) as RetrievedGenerationObservableStepLog[],
    episode: cloneEpisode(args.episode),
    retrievals: args.retrievals.map(cloneRetrievalRecord),
    privilegedRetrievalPlan: args.privilegedRetrievalPlan
      ? clonePrivilegedPlan(args.privilegedRetrievalPlan)
      : null,
    summary: {
      bWork: working.budgetTokens,
      peakWorkingSetTokens: Math.max(...peakCandidates),
      finalWorkingSetTokens: working.currentTokenUsage,
      uniqueObservedUnitCount: working.uniqueAdmittedUnitCount,
      uniqueObservedTokens,
      cumulativeAdmissionTokens: working.cumulativeUnitAdmissionTokens,
      rereadCount: working.rereadCount,
      cumulativeRereadTokens: working.cumulativeRereadTokens,
      retrievalCount: args.retrievals.length,
      failedRetrievalCount,
      totalRetrievedTokens: args.episode.explorationBudget.used.cumulativeRetrievedTokens,
      evictionCount: working.evictionHistory.length,
      modelCalls: args.episode.explorationBudget.used.modelCalls,
      decisionRounds: args.episode.explorationBudget.used.decisionRounds,
      tokenCountMethod: working.tokenCountMethod,
      evictionPolicy: working.evictionPolicy,
      api: summarizeProviderTelemetry(args.episode),
    },
  };
}

function summarizeProviderTelemetry(
  episode: ResearchStatelessEpisodeTelemetry
): RetrievedGenerationApiSummary {
  const providerRows = episode.steps
    .map((step) => step.providerTelemetry)
    .filter((row) => row !== null);
  const complete = providerRows.length === episode.steps.length;
  if (providerRows.length === 0) {
    return {
      providerTelemetryComplete: false,
      providerCallsLogged: 0,
      tokenUsage: null,
      latencyMs: null,
      costUsd: null,
    };
  }

  const aggregate: TokenUsage = {
    input: 0,
    output: 0,
    cachedInput: 0,
    cacheWriteInput: 0,
    reasoningOutput: 0,
    total: 0,
  };
  let usageComplete = true;
  let latencyComplete = true;
  let costComplete = true;
  let latency = 0;
  let cost = 0;
  for (const row of providerRows) {
    if (!row) continue;
    if (!row.tokenUsage) {
      usageComplete = false;
    } else {
      aggregate.input += row.tokenUsage.input;
      aggregate.output += row.tokenUsage.output;
      aggregate.cachedInput = (aggregate.cachedInput ?? 0) + (row.tokenUsage.cachedInput ?? 0);
      aggregate.cacheWriteInput =
        (aggregate.cacheWriteInput ?? 0) + (row.tokenUsage.cacheWriteInput ?? 0);
      aggregate.reasoningOutput =
        (aggregate.reasoningOutput ?? 0) + (row.tokenUsage.reasoningOutput ?? 0);
      aggregate.total = (aggregate.total ?? 0) +
        (row.tokenUsage.total ?? row.tokenUsage.input + row.tokenUsage.output);
    }
    if (row.latencyMs === null) latencyComplete = false;
    else latency += row.latencyMs;
    if (row.costUsd === null) costComplete = false;
    else cost += row.costUsd;
  }

  return {
    providerTelemetryComplete: complete,
    providerCallsLogged: providerRows.length,
    tokenUsage: complete && usageComplete ? aggregate : null,
    latencyMs: complete && latencyComplete ? latency : null,
    costUsd: complete && costComplete ? cost : null,
  };
}

function cloneEpisode(
  episode: ResearchStatelessEpisodeTelemetry
): ResearchStatelessEpisodeTelemetry {
  return cloneJson(episode) as ResearchStatelessEpisodeTelemetry;
}

function cloneRetrievalRecord(
  record: BudgetedRetrievalRecord
): BudgetedRetrievalRecord {
  return cloneJson(record) as BudgetedRetrievalRecord;
}

function clonePrivilegedPlan(plan: PrivilegedRetrievalPlan): PrivilegedRetrievalPlan {
  return cloneJson(plan) as PrivilegedRetrievalPlan;
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
