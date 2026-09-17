import { createHash } from "crypto";
import type { TokenUsage } from "../types";
import {
  ExplorationBudget,
  ExplorationBudgetExceededError,
  ExplorationBudgetSnapshot,
  ExplorationUsage,
} from "./exploration-budget";
import {
  WorkingSetEvictionRecord,
  WorkingSetManager,
  WorkingSetSnapshot,
} from "./working-set-manager";
import { serializeArtifactUnitForWorkingSet } from "../measurement/artifact-unit";
import { CANONICAL_TOKEN_COUNT_METHOD } from "../measurement/token-counter";

export const RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION =
  "research-stateless-episode-v3-runtime-observation" as const;

export type ResearchStatelessCondition = "PR" | "AR";

/** Fixed function/tool schema visible to each fresh inference step. */
export interface ResearchStatelessToolDefinition {
  name: string;
  description: string;
  parameters: Readonly<Record<string, unknown>>;
}

/**
 * Small, controller/tool-result status carried to exactly the next fresh inference.
 * It is deliberately not repository content and is not persisted provider state.
 * The exact value is logged so the next model input is reconstructable.
 */
export type ResearchStatelessRuntimeObservationKind =
  | "no-more-evidence"
  | "empty-retrieval-result";

export interface ResearchStatelessRuntimeObservation {
  kind: ResearchStatelessRuntimeObservationKind;
  message: string;
}

/**
 * The complete variable model input for one PR/AR reasoning step.
 *
 * Fixed system/tool/output schemas are bound by protocolId/toolDefinitions in the
 * executor factory, not carried forward from a prior response. Deliberately absent
 * fields include prior assistant messages, response ids, provider threads,
 * reasoning items, and any opaque continuation handle.
 */
export interface ResearchStatelessModelInput {
  visibleInstruction: string;
  artifactEvidence: readonly string[];
  explicitMemory: string | null;
  /** One-step observable tool/controller outcome from the immediately prior action. */
  runtimeObservation: ResearchStatelessRuntimeObservation | null;
}

export interface ResearchStatelessTransportAttestation {
  protocolId: string;
  previousResponseIdUsed: boolean;
  providerConversationReused: boolean;
  priorAssistantHistoryReplayed: boolean;
  encryptedReasoningReplayed: boolean;
  compactionStateReplayed: boolean;
  otherOpaqueStateReplayed: boolean;
  responseStored: boolean;
}

/** Observable provider-side accounting for one fresh inference attempt. */
export interface ResearchStatelessProviderTelemetry {
  provider: string;
  requestedModel: string | null;
  actualModel: string | null;
  responseId: string | null;
  responseStatus: string | null;
  tokenUsage: TokenUsage | null;
  latencyMs: number | null;
  costUsd: number | null;
}

export interface ResearchStatelessStepResult<TDecision = unknown> {
  decision: TDecision;
  rawResponse: string;
  /** undefined = retain current memory; null = clear; string = replace. */
  explicitMemoryUpdate?: string | null;
  transport: ResearchStatelessTransportAttestation;
  /** Optional for deterministic/offline executors; live provider adapters should populate it. */
  providerTelemetry?: ResearchStatelessProviderTelemetry | null;
}

export interface ResearchStatelessStepExecutor<TDecision = unknown> {
  runFresh(
    input: Readonly<ResearchStatelessModelInput>
  ): Promise<ResearchStatelessStepResult<TDecision>>;
}

export interface ResearchStatelessExecutorFactoryArgs {
  condition: ResearchStatelessCondition;
  protocolId: string;
  /** Fixed schemas only; execution is owned by the P5 controller/gateway. */
  toolDefinitions: readonly ResearchStatelessToolDefinition[];
}

export type ResearchStatelessStepExecutorFactory<TDecision = unknown> = (
  args: Readonly<ResearchStatelessExecutorFactoryArgs>
) => ResearchStatelessStepExecutor<TDecision>;

export interface ResearchStatelessWorkingSetTelemetry {
  budgetTokens: number;
  activeUnitIds: string[];
  artifactTokens: number;
  memoryTokens: number;
  currentTokenUsage: number;
  remainingBudget: number;
  cumulativeUnitAdmissionTokens: number;
  uniqueAdmittedUnitCount: number;
  totalAdmissionCount: number;
  rereadCount: number;
  cumulativeRereadTokens: number;
  evictionPolicy: WorkingSetSnapshot["evictionPolicy"];
  evictionHistory: WorkingSetEvictionRecord[];
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
}

export interface ResearchStatelessStepTelemetry {
  stepIndex: number;
  modelInputHash: string;
  activeUnitIdsBefore: string[];
  activeUnitIdsAfter: string[];
  workingSetTokensBefore: number;
  workingSetTokensAfter: number;
  memoryTokensBefore: number;
  memoryTokensAfter: number;
  /** Exact explicit model-visible memory, needed to reconstruct W_t across steps. */
  explicitMemoryBefore: string | null;
  explicitMemoryAfter: string | null;
  explicitMemoryChanged: boolean;
  /** Exact one-step runtime/tool observation visible to this inference. */
  runtimeObservationBefore: ResearchStatelessRuntimeObservation | null;
  transport: ResearchStatelessTransportAttestation;
  providerTelemetry: ResearchStatelessProviderTelemetry | null;
  explorationUsedAfter: ExplorationUsage;
}

export interface ResearchStatelessEpisodeTelemetry {
  schemaVersion: typeof RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION;
  condition: ResearchStatelessCondition;
  taskId: string;
  protocolId: string;
  steps: ResearchStatelessStepTelemetry[];
  workingSet: ResearchStatelessWorkingSetTelemetry;
  explorationBudget: ExplorationBudgetSnapshot;
  /** Queued but not yet consumed by a fresh inference, useful on E_max failure. */
  pendingRuntimeObservation: ResearchStatelessRuntimeObservation | null;
}

export interface ResearchStatelessStepExecution<TDecision = unknown> {
  decision: TDecision;
  rawResponse: string;
  explicitMemoryUpdate: string | null | undefined;
  telemetry: ResearchStatelessStepTelemetry;
}

export interface ResearchStatelessEpisodeOptions<TDecision = unknown> {
  condition: ResearchStatelessCondition;
  taskId: string;
  visibleInstruction: string;
  /** Frozen identity for the fixed system/tool/output schema used by every step. */
  protocolId: string;
  /** Fixed function schemas visible to every fresh step; no executable closures here. */
  toolDefinitions?: readonly ResearchStatelessToolDefinition[];
  workingSet: WorkingSetManager;
  explorationBudget: ExplorationBudget;
  executorFactory: ResearchStatelessStepExecutorFactory<TDecision>;
}

/** P4 Step 7 research-stateless inference boundary for PR/AR. */
export class ResearchStatelessEpisodeRunner<TDecision = unknown> {
  private readonly condition: ResearchStatelessCondition;
  private readonly taskId: string;
  private readonly visibleInstruction: string;
  private readonly protocolId: string;
  private readonly toolDefinitions: readonly ResearchStatelessToolDefinition[];
  private readonly workingSet: WorkingSetManager;
  private readonly explorationBudget: ExplorationBudget;
  private readonly executorFactory: ResearchStatelessStepExecutorFactory<TDecision>;
  private readonly stepTelemetry: ResearchStatelessStepTelemetry[] = [];
  private previousExecutor: ResearchStatelessStepExecutor<TDecision> | null = null;
  private nextStepIndex = 0;
  private pendingRuntimeObservation: ResearchStatelessRuntimeObservation | null = null;

  constructor(options: ResearchStatelessEpisodeOptions<TDecision>) {
    if (!options.taskId) throw new Error("research-stateless taskId must be non-empty");
    if (!options.visibleInstruction) {
      throw new Error("research-stateless visibleInstruction must be non-empty");
    }
    if (!options.protocolId) {
      throw new Error("research-stateless protocolId must be non-empty");
    }
    this.condition = options.condition;
    this.taskId = options.taskId;
    this.visibleInstruction = options.visibleInstruction;
    this.protocolId = options.protocolId;
    this.toolDefinitions = Object.freeze(
      (options.toolDefinitions ?? []).map((tool) =>
        Object.freeze({
          name: tool.name,
          description: tool.description,
          parameters: Object.freeze({ ...tool.parameters }),
        })
      )
    );
    this.workingSet = options.workingSet;
    this.explorationBudget = options.explorationBudget;
    this.executorFactory = options.executorFactory;
  }

  /** Queue a small observable tool/controller result for exactly the next fresh step. */
  queueRuntimeObservation(
    observation: ResearchStatelessRuntimeObservation | null
  ): void {
    if (observation === null) {
      this.pendingRuntimeObservation = null;
      return;
    }
    if (!observation.message) {
      throw new Error("Runtime observation message must be non-empty");
    }
    if (this.pendingRuntimeObservation !== null) {
      throw new Error("Cannot overwrite an unconsumed research-stateless runtime observation");
    }
    this.pendingRuntimeObservation = cloneRuntimeObservation(observation);
  }

  async runStep(): Promise<ResearchStatelessStepExecution<TDecision>> {
    const stepIndex = this.nextStepIndex;
    const label = `research-stateless-step-${stepIndex}`;
    const explorationBefore = this.explorationBudget.snapshot();
    this.assertInferenceOpportunityAvailable(explorationBefore);

    const workingBefore = this.workingSet.snapshot();
    const runtimeObservationBefore = cloneRuntimeObservation(this.pendingRuntimeObservation);
    const modelInput = buildResearchStatelessModelInput(
      this.visibleInstruction,
      workingBefore,
      runtimeObservationBefore
    );
    const modelInputHash = hashModelInput(modelInput);

    const executor = this.executorFactory({
      condition: this.condition,
      protocolId: this.protocolId,
      toolDefinitions: this.toolDefinitions,
    });
    if (executor === this.previousExecutor) {
      throw new Error(
        "Research-stateless violation: executorFactory reused the previous executor instance"
      );
    }
    this.previousExecutor = executor;

    // The observation is one-step input, analogous to a tool result. It is not
    // provider history and must not survive beyond the fresh inference that sees it.
    this.pendingRuntimeObservation = null;

    this.explorationBudget.recordDecisionRound(label);
    this.explorationBudget.recordModelCall(label);
    this.nextStepIndex += 1;

    const result = await executor.runFresh(modelInput);
    assertResearchStatelessTransport(result.transport, this.protocolId);

    if (result.explicitMemoryUpdate !== undefined) {
      this.workingSet.setExplicitMemory(result.explicitMemoryUpdate);
    }

    const workingAfter = this.workingSet.snapshot();
    const telemetry: ResearchStatelessStepTelemetry = {
      stepIndex,
      modelInputHash,
      activeUnitIdsBefore: workingBefore.activeUnits.map((unit) => unit.id),
      activeUnitIdsAfter: workingAfter.activeUnits.map((unit) => unit.id),
      workingSetTokensBefore: workingBefore.currentTokenUsage,
      workingSetTokensAfter: workingAfter.currentTokenUsage,
      memoryTokensBefore: workingBefore.memoryTokens,
      memoryTokensAfter: workingAfter.memoryTokens,
      explicitMemoryBefore: workingBefore.explicitMemory?.content ?? null,
      explicitMemoryAfter: workingAfter.explicitMemory?.content ?? null,
      explicitMemoryChanged: result.explicitMemoryUpdate !== undefined,
      runtimeObservationBefore,
      transport: { ...result.transport },
      providerTelemetry: cloneProviderTelemetry(result.providerTelemetry ?? null),
      explorationUsedAfter: { ...this.explorationBudget.snapshot().used },
    };
    this.stepTelemetry.push(telemetry);

    return {
      decision: result.decision,
      rawResponse: result.rawResponse,
      explicitMemoryUpdate: result.explicitMemoryUpdate,
      telemetry: cloneStepTelemetry(telemetry),
    };
  }

  telemetry(): ResearchStatelessEpisodeTelemetry {
    return {
      schemaVersion: RESEARCH_STATELESS_EPISODE_SCHEMA_VERSION,
      condition: this.condition,
      taskId: this.taskId,
      protocolId: this.protocolId,
      steps: this.stepTelemetry.map(cloneStepTelemetry),
      workingSet: summarizeWorkingSet(this.workingSet.snapshot()),
      explorationBudget: this.explorationBudget.snapshot(),
      pendingRuntimeObservation: cloneRuntimeObservation(this.pendingRuntimeObservation),
    };
  }

  private assertInferenceOpportunityAvailable(
    snapshot: ExplorationBudgetSnapshot
  ): void {
    if (snapshot.pendingRetrieval) {
      throw new Error(
        "Cannot run research-stateless inference while retrieval is pending: " +
        `${snapshot.pendingRetrieval.label ?? "<unlabeled>"}`
      );
    }
    const violations: string[] = [];
    if (snapshot.remaining.decisionRounds < 1) {
      violations.push(
        `decisionRounds=${snapshot.used.decisionRounds}/${snapshot.limits.maxDecisionRounds}`
      );
    }
    if (snapshot.remaining.modelCalls < 1) {
      violations.push(
        `modelCalls=${snapshot.used.modelCalls}/${snapshot.limits.maxModelCalls}`
      );
    }
    if (violations.length > 0) {
      throw new ExplorationBudgetExceededError(
        `E_max cannot reserve research-stateless inference: ${violations.join(", ")}`,
        violations
      );
    }
  }
}

export function buildResearchStatelessModelInput(
  visibleInstruction: string,
  snapshot: WorkingSetSnapshot,
  runtimeObservation: ResearchStatelessRuntimeObservation | null = null
): Readonly<ResearchStatelessModelInput> {
  const artifactEvidence = snapshot.activeUnits.map((unit) =>
    serializeArtifactUnitForWorkingSet(unit)
  );
  const accountedArtifactTokens = snapshot.activeUnits.reduce(
    (sum, unit) => sum + unit.tokenCount,
    0
  );
  if (accountedArtifactTokens !== snapshot.artifactTokens) {
    throw new Error(
      `Working-set artifact accounting drift: units=${accountedArtifactTokens}, ` +
      `snapshot=${snapshot.artifactTokens}`
    );
  }
  if (snapshot.currentTokenUsage > snapshot.budgetTokens) {
    throw new Error(
      `B_work invariant violated before inference: ` +
      `${snapshot.currentTokenUsage}/${snapshot.budgetTokens}`
    );
  }

  return Object.freeze({
    visibleInstruction,
    artifactEvidence: Object.freeze([...artifactEvidence]),
    explicitMemory: snapshot.explicitMemory?.content ?? null,
    runtimeObservation: cloneRuntimeObservation(runtimeObservation),
  });
}

export function assertResearchStatelessTransport(
  transport: ResearchStatelessTransportAttestation,
  expectedProtocolId: string
): void {
  if (transport.protocolId !== expectedProtocolId) {
    throw new Error(
      `Research-stateless violation: protocolId drifted ` +
      `(${transport.protocolId} != ${expectedProtocolId})`
    );
  }

  const forbidden: string[] = [];
  if (transport.previousResponseIdUsed) forbidden.push("previous_response_id");
  if (transport.providerConversationReused) forbidden.push("provider conversation/thread");
  if (transport.priorAssistantHistoryReplayed) forbidden.push("prior assistant history");
  if (transport.encryptedReasoningReplayed) forbidden.push("reasoning.encrypted_content");
  if (transport.compactionStateReplayed) forbidden.push("Responses compaction state");
  if (transport.otherOpaqueStateReplayed) forbidden.push("other opaque persisted state");
  if (transport.responseStored) forbidden.push("stored provider response");

  if (forbidden.length > 0) {
    throw new Error(
      `Research-stateless violation: forbidden continuation state used: ${forbidden.join(", ")}`
    );
  }
}

function hashModelInput(input: Readonly<ResearchStatelessModelInput>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function summarizeWorkingSet(
  snapshot: WorkingSetSnapshot
): ResearchStatelessWorkingSetTelemetry {
  return {
    budgetTokens: snapshot.budgetTokens,
    activeUnitIds: snapshot.activeUnits.map((unit) => unit.id),
    artifactTokens: snapshot.artifactTokens,
    memoryTokens: snapshot.memoryTokens,
    currentTokenUsage: snapshot.currentTokenUsage,
    remainingBudget: snapshot.remainingBudget,
    cumulativeUnitAdmissionTokens: snapshot.cumulativeUnitAdmissionTokens,
    uniqueAdmittedUnitCount: snapshot.uniqueAdmittedUnitCount,
    totalAdmissionCount: snapshot.totalAdmissionCount,
    rereadCount: snapshot.rereadCount,
    cumulativeRereadTokens: snapshot.cumulativeRereadTokens,
    evictionPolicy: snapshot.evictionPolicy,
    evictionHistory: snapshot.evictionHistory.map((entry) => ({ ...entry })),
    tokenCountMethod: snapshot.tokenCountMethod,
  };
}

function cloneProviderTelemetry(
  telemetry: ResearchStatelessProviderTelemetry | null
): ResearchStatelessProviderTelemetry | null {
  if (!telemetry) return null;
  return {
    ...telemetry,
    tokenUsage: telemetry.tokenUsage ? { ...telemetry.tokenUsage } : null,
  };
}

function cloneRuntimeObservation(
  observation: ResearchStatelessRuntimeObservation | null
): ResearchStatelessRuntimeObservation | null {
  return observation ? { ...observation } : null;
}

function cloneStepTelemetry(
  telemetry: ResearchStatelessStepTelemetry
): ResearchStatelessStepTelemetry {
  return {
    ...telemetry,
    activeUnitIdsBefore: [...telemetry.activeUnitIdsBefore],
    activeUnitIdsAfter: [...telemetry.activeUnitIdsAfter],
    runtimeObservationBefore: cloneRuntimeObservation(telemetry.runtimeObservationBefore),
    transport: { ...telemetry.transport },
    providerTelemetry: cloneProviderTelemetry(telemetry.providerTelemetry),
    explorationUsedAfter: { ...telemetry.explorationUsedAfter },
  };
}
