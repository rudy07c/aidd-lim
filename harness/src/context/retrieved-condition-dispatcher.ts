import * as fs from "fs";
import * as path from "path";
import type { GroundTruth, GroundTruthDelta, NamingScheme } from "../../../synthetic-world/schema";
import type { AgentResult, AgentToolEvent } from "../agent-backend/types";
import { createOpenAIResearchStatelessARExecutorFactory } from "../agent-backend/openai/research-stateless-ar";
import { createOpenAIResearchStatelessPRExecutorFactory } from "../agent-backend/openai/research-stateless-pr";
import { ResearchStatelessProviderFailure } from "../agent-backend/research-stateless-provider-failure";
import type {
  AgentRetrievedDecision,
} from "./agent-retrieved-episode";
import { AgentRetrievedEpisode } from "./agent-retrieved-episode";
import { ExplorationBudget, ExplorationLimits } from "./exploration-budget";
import type {
  PrivilegedRetrievedDecision,
} from "./privileged-retrieved-episode";
import { PrivilegedRetrievedEpisode } from "./privileged-retrieved-episode";
import type {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessProviderTelemetry,
  ResearchStatelessTransportAttestation,
} from "./research-stateless-episode";
import {
  buildAgentRetrievedGenerationLog,
  buildFailedAgentRetrievedGenerationLog,
  buildFailedPrivilegedRetrievedGenerationLog,
  buildPrivilegedRetrievedGenerationLog,
  RetrievedGenerationLog,
} from "./retrieved-generation-log";
import { RetrievedEpisodeRuntimeFailure } from "./retrieved-episode-runtime";
import { WorkingSetManager } from "./working-set-manager";
import type {
  ModelProvenance,
  NormalizedAgentError,
  RunConfig,
  TokenUsage,
} from "../types";

export interface RetrievedTaskDescriptor {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

export interface RetrievedConditionExecution {
  agentResult: AgentResult;
  retrievedLog: RetrievedGenerationLog;
}

const PROTOCOL_ID = "stage1-p5.5-retrieved-v1";

export async function runRetrievedCondition(args: {
  config: RunConfig;
  task: RetrievedTaskDescriptor;
  repositoryFiles: Readonly<Record<string, string>>;
}): Promise<RetrievedConditionExecution> {
  const { config, task, repositoryFiles } = args;
  if (config.condition !== "PR" && config.condition !== "AR") {
    throw new Error(`Retrieved condition dispatcher received ${config.condition}`);
  }
  if (typeof config.contextBudget !== "number") {
    throw new Error(`${config.condition} requires numeric B_work`);
  }

  const workingSet = new WorkingSetManager(config.contextBudget);
  const explorationBudget = new ExplorationBudget(explorationLimits(config));

  if (config.condition === "AR") {
    const episode = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
      taskId: task.taskId,
      visibleInstruction: task.visibleInstruction,
      protocolId: PROTOCOL_ID,
      repositoryFiles,
      workingSet,
      explorationBudget,
      executorFactory: createARExecutorFactory(config),
    });
    try {
      const result = await episode.run();
      const retrievedLog = buildAgentRetrievedGenerationLog(result);
      return {
        agentResult: agentResultFromRetrieved(
          config,
          result.final.modifiedFiles,
          retrievedLog,
          "ok",
          null
        ),
        retrievedLog,
      };
    } catch (error) {
      if (error instanceof RetrievedEpisodeRuntimeFailure) {
        const retrievedLog = buildFailedAgentRetrievedGenerationLog(error);
        return {
          agentResult: agentResultFromRetrieved(
            config,
            {},
            retrievedLog,
            "tool-error",
            { category: "tool", message: error.message, retryable: null }
          ),
          retrievedLog,
        };
      }
      if (error instanceof ResearchStatelessProviderFailure) {
        const failure = episode.failureSnapshot(error.message);
        const retrievedLog = buildFailedAgentRetrievedGenerationLog(failure);
        return {
          agentResult: agentResultFromRetrieved(
            config,
            {},
            retrievedLog,
            error.executionStatus,
            error.normalizedError,
            error.providerTelemetry,
            error.rawResponse
          ),
          retrievedLog,
        };
      }
      throw error;
    }
  }

  const privileged = loadPrivilegedInputs(config.syntheticWorldDir, task);
  const episode = new PrivilegedRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: task.taskId,
    visibleInstruction: task.visibleInstruction,
    protocolId: PROTOCOL_ID,
    repositoryFiles,
    groundTruth: privileged.groundTruth,
    delta: privileged.delta,
    namingScheme: privileged.namingScheme,
    workingSet,
    explorationBudget,
    executorFactory: createPRExecutorFactory(config),
  });
  try {
    const result = await episode.run();
    const retrievedLog = buildPrivilegedRetrievedGenerationLog(result);
    return {
      agentResult: agentResultFromRetrieved(
        config,
        result.final.modifiedFiles,
        retrievedLog,
        "ok",
        null
      ),
      retrievedLog,
    };
  } catch (error) {
    if (error instanceof RetrievedEpisodeRuntimeFailure) {
      const retrievedLog = buildFailedPrivilegedRetrievedGenerationLog(
        error,
        episode.retrievalPlanSnapshot()
      );
      return {
        agentResult: agentResultFromRetrieved(
          config,
          {},
          retrievedLog,
          "tool-error",
          { category: "tool", message: error.message, retryable: null }
        ),
        retrievedLog,
      };
    }
    if (error instanceof ResearchStatelessProviderFailure) {
      const failure = episode.failureSnapshot(error.message);
      const retrievedLog = buildFailedPrivilegedRetrievedGenerationLog(
        failure,
        episode.retrievalPlanSnapshot()
      );
      return {
        agentResult: agentResultFromRetrieved(
          config,
          {},
          retrievedLog,
          error.executionStatus,
          error.normalizedError,
          error.providerTelemetry,
          error.rawResponse
        ),
        retrievedLog,
      };
    }
    throw error;
  }
}

function explorationLimits(config: RunConfig): ExplorationLimits {
  const required = <K extends keyof RunConfig>(key: K): number => {
    const value = config[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new Error(`Retrieved runtime requires positive integer ${String(key)}`);
    }
    return value;
  };
  return {
    maxRetrievalOperations: required("maxRetrievalOperations"),
    maxCumulativeRetrievedTokens: required("maxCumulativeRetrievedTokens"),
    maxModelCalls: required("maxModelCalls"),
    maxDecisionRounds: required("maxDecisionRounds"),
  };
}

function createARExecutorFactory(config: RunConfig) {
  switch (config.backend) {
    case "mock-noop":
      return (_args: Readonly<ResearchStatelessExecutorFactoryArgs>) => ({
        async runFresh(input: { artifactEvidence: readonly string[] }) {
          const retrieve = input.artifactEvidence.length === 0;
          return {
            decision: retrieve
              ? ({
                  kind: "retrieve",
                  call: {
                    toolName: "list_files",
                    arguments: {
                      directory: null,
                      workingNote: "Repository listing requested for the next fresh step.",
                    },
                  },
                } as AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }>)
              : ({ kind: "finalize", value: { modifiedFiles: {} } } as AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }>),
            rawResponse: retrieve ? "[mock-noop] list_files" : "[mock-noop] finalize without changes",
            explicitMemoryUpdate: retrieve
              ? "Repository listing requested for the next fresh step."
              : undefined,
            transport: statelessTransport(PROTOCOL_ID),
            providerTelemetry: mockTelemetry("mock-noop-ar"),
          };
        },
      });
    case "openai":
      return createOpenAIResearchStatelessARExecutorFactory(openAIOptions(config));
    default:
      throw new Error(
        `Retrieved AR runtime currently supports backend mock-noop or openai, not ${config.backend}`
      );
  }
}

function createPRExecutorFactory(config: RunConfig) {
  switch (config.backend) {
    case "mock-noop":
      return (_args: Readonly<ResearchStatelessExecutorFactoryArgs>) => ({
        async runFresh(input: { artifactEvidence: readonly string[] }) {
          const retrieve = input.artifactEvidence.length === 0;
          return {
            decision: retrieve
              ? ({ kind: "retrieve" } as PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }>)
              : ({ kind: "finalize", value: { modifiedFiles: {} } } as PrivilegedRetrievedDecision<{ modifiedFiles: Record<string, string> }>),
            rawResponse: retrieve ? "[mock-noop] retrieve_next" : "[mock-noop] finalize without changes",
            explicitMemoryUpdate: retrieve
              ? "Privileged evidence requested for the next fresh step."
              : undefined,
            transport: statelessTransport(PROTOCOL_ID),
            providerTelemetry: mockTelemetry("mock-noop-pr"),
          };
        },
      });
    case "openai":
      return createOpenAIResearchStatelessPRExecutorFactory(openAIOptions(config));
    default:
      throw new Error(
        `Retrieved PR runtime currently supports backend mock-noop or openai, not ${config.backend}`
      );
  }
}

function openAIOptions(config: RunConfig) {
  return {
    model: config.model ?? "gpt-5.6-luna",
    reasoningEffort: config.reasoningEffort ?? "medium",
    maxOutputTokens: config.maxOutputTokens ?? 8192,
    requestTimeoutMs: config.requestTimeoutMs ?? 120_000,
    maxRetries: config.maxRetries ?? 2,
    storeResponses: config.storeResponses ?? false,
    serviceTier: config.serviceTier ?? "default",
    promptCacheMode: config.promptCacheMode ?? "implicit",
  } as const;
}

function loadPrivilegedInputs(
  syntheticWorldDir: string,
  task: RetrievedTaskDescriptor
): { groundTruth: GroundTruth; delta: GroundTruthDelta; namingScheme: NamingScheme } {
  if (!task.groundTruthDelta) {
    throw new Error(`PR task ${task.taskId} is missing GroundTruthDelta`);
  }
  if (!task.namingScheme) {
    throw new Error(`PR task ${task.taskId} is missing namingScheme`);
  }
  const groundTruth = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8")
  ) as GroundTruth;
  const schemes = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8")
  ) as NamingScheme[];
  const namingScheme = schemes.find((candidate) => candidate.schemeId === task.namingScheme);
  if (!namingScheme) {
    throw new Error(`Naming scheme not found for PR task ${task.taskId}: ${task.namingScheme}`);
  }
  return { groundTruth, delta: task.groundTruthDelta, namingScheme };
}

function agentResultFromRetrieved(
  config: RunConfig,
  modifiedFiles: Record<string, string>,
  log: RetrievedGenerationLog,
  executionStatus: AgentResult["executionStatus"],
  error: NormalizedAgentError | null,
  providerTelemetryOverride: ResearchStatelessProviderTelemetry | null = null,
  rawResponseOverride: string | null = null
): AgentResult {
  const observableAssistantMessages = log.observableSteps
    .map((step) => step.rawResponse)
    .filter((value) => value.length > 0);
  const rawResponse = rawResponseOverride ?? observableAssistantMessages.join("\n");
  const finalStep = log.episode.steps[log.episode.steps.length - 1];
  const toolEvents: AgentToolEvent[] = log.retrievals.map((record) => ({
    callId: record.label,
    toolName: record.operation,
    arguments: record.request,
    result: {
      candidateUnitIds: record.candidateUnitIds,
      exposedUnitIds: record.exposedUnitIds,
      admittedUnitIds: record.admittedUnitIds,
      rereadUnitIds: record.rereadUnitIds,
    },
    ok: record.error === null,
    error: record.error ?? undefined,
  }));
  const api = log.summary.api;
  return {
    modifiedFiles,
    rawResponse,
    observableAssistantMessages,
    explicitWorkingNote: finalStep?.explicitMemoryAfter ?? null,
    toolEvents,
    tokenUsage: providerTelemetryOverride?.tokenUsage ?? api.tokenUsage ?? undefined,
    latencyMs: providerTelemetryOverride?.latencyMs ?? api.latencyMs ?? 0,
    executionStatus,
    modelProvenance: modelProvenance(config, log, providerTelemetryOverride),
    estimatedCostUsd: providerTelemetryOverride?.costUsd ?? api.costUsd,
    error,
  };
}

function modelProvenance(
  config: RunConfig,
  log: RetrievedGenerationLog,
  providerTelemetryOverride: ResearchStatelessProviderTelemetry | null = null
): ModelProvenance {
  const providerRows = log.episode.steps
    .map((step) => step.providerTelemetry)
    .filter((row): row is ResearchStatelessProviderTelemetry => row !== null);
  const last = providerTelemetryOverride ?? providerRows[providerRows.length - 1] ?? null;
  return {
    provider: config.backend === "openai" ? "openai" : "mock",
    requestedModel: config.backend === "openai" ? config.model ?? "gpt-5.6-luna" : null,
    actualModel: last?.actualModel ?? (config.backend === "mock-noop" ? "mock-noop" : null),
    responseId: last?.responseId ?? null,
    responseStatus: last?.responseStatus ?? (config.backend === "mock-noop" ? "completed" : null),
    endpoint: config.backend === "openai" ? "responses" : "mock",
    reasoningEffort: config.backend === "openai" ? config.reasoningEffort ?? "medium" : null,
    maxOutputTokens: config.backend === "openai" ? config.maxOutputTokens ?? 8192 : null,
    structuredOutput: true,
    storeResponses: config.backend === "openai" ? config.storeResponses ?? false : null,
    requestedServiceTier: config.backend === "openai" ? config.serviceTier ?? "default" : null,
    actualServiceTier: null,
    promptCacheMode: config.backend === "openai" ? config.promptCacheMode ?? "implicit" : null,
    promptVersion: PROTOCOL_ID,
    promptHash: null,
    schemaVersion: log.schemaVersion,
    schemaHash: null,
    pricingMode: config.backend === "openai" ? "sync" : null,
    continuationState: "none",
    incompleteReason: null,
    refusal: null,
    providerErrorCode: null,
    sdkVersion: null,
    retryPolicy: {
      maxRetries: config.backend === "openai" ? config.maxRetries ?? 2 : 0,
      timeoutMs: config.backend === "openai" ? config.requestTimeoutMs ?? 120_000 : null,
    },
  };
}

function statelessTransport(protocolId: string): ResearchStatelessTransportAttestation {
  return {
    protocolId,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  };
}

function mockTelemetry(actualModel: string): ResearchStatelessProviderTelemetry {
  const usage: TokenUsage = { input: 0, output: 0, total: 0 };
  return {
    provider: "mock",
    requestedModel: null,
    actualModel,
    responseId: null,
    responseStatus: "completed",
    tokenUsage: usage,
    latencyMs: 0,
    costUsd: 0,
  };
}
