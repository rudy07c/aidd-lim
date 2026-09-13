import { createHash } from "crypto";
import {
  ExplorationBudget,
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
  "research-stateless-episode-v1" as const;

export type ResearchStatelessCondition = "PR" | "AR";

/** Fixed function/tool schema visible to each fresh inference step. */
export interface ResearchStatelessToolDefinition {
  name: string;
  description: string;
  parameters: Readonly<Record<string, unknown>>;
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

export interface ResearchStatelessStepResult<TDecision = unknown> {
  decision: TDecision;
  rawResponse: string;
  /** undefined = retain current memory; null = clear; string = replace. */
  explicitMemoryUpdate?: string | null;
  transport: ResearchStatelessTransportAttestation;
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
  explicitMemoryChanged: boolean;
  transport: ResearchStatelessTransportAttestation;
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

  async runStep(): Promise<ResearchStatelessStepExecution<TDecision>> {
    const stepIndex = this.nextStepIndex;
    const label = `research-stateless-step-${stepIndex}`;
    const explorationBefore = this.explorationBudget.snapshot();
    this.assertInferenceOpportunityAvailable(explorationBefore);

    const workingBefore = this.workingSet.snapshot();
    const modelInput = buildResearchStatelessModelInput(
      this.visibleInstruction,
      workingBefore
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
      explicitMemoryChanged: result.explicitMemoryUpdate !== undefined,
      transport: { ...result.transport },
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
      throw new Error(
        `E_max cannot reserve research-stateless inference: ${violations.join(", ")}`
      );
    }
  }
}

export function buildResearchStatelessModelInput(
  visibleInstruction: string,
  snapshot: WorkingSetSnapshot
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

function cloneStepTelemetry(
  telemetry: ResearchStatelessStepTelemetry
): ResearchStatelessStepTelemetry {
  return {
    ...telemetry,
    activeUnitIdsBefore: [...telemetry.activeUnitIdsBefore],
    activeUnitIdsAfter: [...telemetry.activeUnitIdsAfter],
    transport: { ...telemetry.transport },
    explorationUsedAfter: { ...telemetry.explorationUsedAfter },
  };
}
