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

/**
 * The complete variable model input for one PR/AR reasoning step.
 *
 * Fixed system/tool/output schemas are bound by protocolId in the executor factory,
 * not carried forward from a prior response. Deliberately absent fields include
 * prior assistant messages, response ids, provider threads, reasoning items, and
 * any opaque continuation handle.
 */
export interface ResearchStatelessModelInput {
  visibleInstruction: string;
  artifactEvidence: readonly string[];
  explicitMemory: string | null;
}

/**
 * Provider adapter attestation checked after every inference. P5 provider adapters
 * must populate these from the request path they actually used. All persisted /
 * replayed continuation-state flags are forbidden for PR/AR.
 */
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

/**
 * The runner interprets only explicitMemoryUpdate. `decision` is intentionally
 * opaque here; P5 condition-specific controllers define retrieval/finalization
 * semantics without changing the research-stateless inference boundary.
 */
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
  workingSet: WorkingSetManager;
  explorationBudget: ExplorationBudget;
  executorFactory: ResearchStatelessStepExecutorFactory<TDecision>;
}

/**
 * P4 Step 7 research-stateless inference boundary for PR/AR.
 *
 * The class deliberately does NOT implement repository access or retrieval policy;
 * those belong to P5. It does establish the common episodic state machine boundary:
 *
 *   current W_t + bounded explicit memory + current task
 *       -> fresh executor / fresh inference
 *       -> optional explicit-memory replacement (counted by B_work)
 *       -> next step rebuilt from current W_t again
 *
 * No raw response or model decision is stored as successor input. The only model-
 * generated state that this runner can persist is explicitMemoryUpdate, which is
 * immediately passed through WorkingSetManager and therefore consumes B_work.
 *
 * The executor factory is called for every step and must return a new executor
 * object. This prevents accidental local conversation state from being inherited
 * through a long-lived backend instance. Provider-specific adapters must also
 * attest that no server/API continuation mechanism was used.
 */
export class ResearchStatelessEpisodeRunner<TDecision = unknown> {
  private readonly condition: ResearchStatelessCondition;
  private readonly taskId: string;
  private readonly visibleInstruction: string;
  private readonly protocolId: string;
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

    // Factory construction is local harness work and occurs only after E_max
    // preflight. It must return a fresh object so no local backend conversation
    // can silently survive between research-stateless steps.
    const executor = this.executorFactory({
      condition: this.condition,
      protocolId: this.protocolId,
    });
    if (executor === this.previousExecutor) {
      throw new Error(
        "Research-stateless violation: executorFactory reused the previous executor instance"
      );
    }
    this.previousExecutor = executor;

    // Preflight above makes this pair atomic for the single-threaded episode
    // runner: neither dimension is consumed if either limit is already unable to
    // admit the next inference opportunity.
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

    // rawResponse/decision are returned to the caller for immediate controller
    // handling only. They are intentionally not retained in this runner and are
    // never included when the next model input is rebuilt.
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
