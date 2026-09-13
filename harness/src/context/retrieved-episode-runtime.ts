import {
  ResearchStatelessCondition,
  ResearchStatelessEpisodeRunner,
  ResearchStatelessEpisodeTelemetry,
  ResearchStatelessStepExecutorFactory,
  ResearchStatelessToolDefinition,
} from "./research-stateless-episode";
import { ExplorationBudget } from "./exploration-budget";
import { WorkingSetManager } from "./working-set-manager";
import {
  BudgetedRepositoryGateway,
  BudgetedRetrievalRecord,
  RetrievalGatewayPhase,
  createBudgetedRepositoryGateway,
} from "../repository/retrieval-gateway";

export const RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION =
  "retrieved-episode-runtime-v1" as const;
export const SHARED_RETRIEVAL_PHASE_CONTRACT: readonly RetrievalGatewayPhase[] =
  Object.freeze(["begin", "access", "complete", "admit"] as const);

export interface RetrievedEpisodeFinalize<TFinal = unknown> {
  kind: "finalize";
  value: TFinal;
}

export interface RetrievedEpisodeContinue {
  kind: "retrieved";
}

export type RetrievedEpisodePolicyOutcome<TFinal = unknown> =
  | RetrievedEpisodeFinalize<TFinal>
  | RetrievedEpisodeContinue;

/**
 * The only condition-specific seam in the PR/AR episode loop.
 *
 * The policy may decide which retrieval to perform, but it receives only the
 * BudgetedRepositoryGateway created by this runtime. Therefore PR and AR share
 * the exact same E_max -> RepositoryAccessor -> B_work path and cannot install a
 * second repository/budget implementation.
 */
export interface RetrievedEpisodePolicy<TDecision, TFinal = unknown> {
  readonly condition: ResearchStatelessCondition;
  readonly toolDefinitions: readonly ResearchStatelessToolDefinition[];
  resolve(decision: TDecision): Promise<RetrievedEpisodePolicyOutcome<TFinal>>;
}

export type RetrievedEpisodePolicyFactory<TDecision, TFinal = unknown> = (
  gateway: BudgetedRepositoryGateway
) => RetrievedEpisodePolicy<TDecision, TFinal>;

export interface RetrievedEpisodeRuntimeOptions<TDecision, TFinal = unknown> {
  condition: ResearchStatelessCondition;
  taskId: string;
  visibleInstruction: string;
  protocolId: string;
  repositoryFiles: Readonly<Record<string, string>>;
  workingSet: WorkingSetManager;
  explorationBudget: ExplorationBudget;
  executorFactory: ResearchStatelessStepExecutorFactory<TDecision>;
  policyFactory: RetrievedEpisodePolicyFactory<TDecision, TFinal>;
}

export interface RetrievedEpisodeRuntimeResult<TFinal = unknown> {
  schemaVersion: typeof RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION;
  condition: ResearchStatelessCondition;
  final: TFinal;
  telemetry: ResearchStatelessEpisodeTelemetry;
  retrievals: BudgetedRetrievalRecord[];
}

/**
 * P5 Step 6 common PR/AR episode runner.
 *
 * Runtime structure is intentionally condition-invariant:
 *   fresh research-stateless inference
 *     -> condition-specific retrieval-decision policy
 *     -> one shared BudgetedRepositoryGateway
 *     -> next fresh inference
 *
 * The gateway is constructed here from the same WorkingSetManager and
 * ExplorationBudget instances given to ResearchStatelessEpisodeRunner. This is
 * the structural parity guarantee: condition code can choose *what* to retrieve,
 * but cannot choose a different E_max/B_work/gateway implementation.
 */
export class RetrievedEpisodeRuntime<TDecision, TFinal = unknown> {
  private readonly gateway: BudgetedRepositoryGateway;
  private readonly policy: RetrievedEpisodePolicy<TDecision, TFinal>;
  private readonly runner: ResearchStatelessEpisodeRunner<TDecision>;

  constructor(private readonly options: RetrievedEpisodeRuntimeOptions<TDecision, TFinal>) {
    this.gateway = createBudgetedRepositoryGateway({
      repositoryFiles: options.repositoryFiles,
      explorationBudget: options.explorationBudget,
      workingSet: options.workingSet,
    });
    this.policy = options.policyFactory(this.gateway);
    if (this.policy.condition !== options.condition) {
      throw new Error(
        `Retrieved episode policy condition mismatch: ${this.policy.condition} != ${options.condition}`
      );
    }
    this.runner = new ResearchStatelessEpisodeRunner({
      condition: options.condition,
      taskId: options.taskId,
      visibleInstruction: options.visibleInstruction,
      protocolId: options.protocolId,
      toolDefinitions: this.policy.toolDefinitions,
      workingSet: options.workingSet,
      explorationBudget: options.explorationBudget,
      executorFactory: options.executorFactory,
    });
  }

  async run(): Promise<RetrievedEpisodeRuntimeResult<TFinal>> {
    while (true) {
      const step = await this.runner.runStep();
      const recordsBefore = this.gateway.records().length;
      const outcome = await this.policy.resolve(step.decision);
      const recordsAfter = this.gateway.records();

      if (outcome.kind === "finalize") {
        if (recordsAfter.length !== recordsBefore) {
          throw new Error(
            "Retrieved episode policy performed repository access while finalizing"
          );
        }
        return {
          schemaVersion: RETRIEVED_EPISODE_RUNTIME_SCHEMA_VERSION,
          condition: this.options.condition,
          final: outcome.value,
          telemetry: this.runner.telemetry(),
          retrievals: recordsAfter,
        };
      }

      if (recordsAfter.length !== recordsBefore + 1) {
        throw new Error(
          `Retrieved episode policy must perform exactly one gateway retrieval per retrieve decision: ` +
          `before=${recordsBefore}, after=${recordsAfter.length}`
        );
      }
      const record = recordsAfter[recordsAfter.length - 1];
      if (!samePhaseTrace(record.phaseTrace, SHARED_RETRIEVAL_PHASE_CONTRACT)) {
        throw new Error(
          `Retrieved episode gateway phase drift: ${record.phaseTrace.join("->")}`
        );
      }
      if (this.options.explorationBudget.snapshot().pendingRetrieval !== null) {
        throw new Error(
          "Retrieved episode policy returned before pending retrieval was closed"
        );
      }
      // The next inference therefore starts only after the shared gateway has
      // completed E_max accounting and B_work admission.
    }
  }
}

function samePhaseTrace(
  actual: readonly RetrievalGatewayPhase[],
  expected: readonly RetrievalGatewayPhase[]
): boolean {
  return actual.length === expected.length && actual.every((phase, index) => phase === expected[index]);
}
