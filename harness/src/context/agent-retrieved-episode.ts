import {
  ResearchStatelessEpisodeTelemetry,
  ResearchStatelessStepExecutorFactory,
} from "./research-stateless-episode";
import {
  RetrievedEpisodeObservableStep,
  RetrievedEpisodeRuntime,
  RetrievedEpisodeRuntimeFailure,
} from "./retrieved-episode-runtime";
import { ExplorationBudget } from "./exploration-budget";
import { WorkingSetManager } from "./working-set-manager";
import {
  AgentRetrievalToolCall,
  createAgentRetrievalTools,
  executeAgentRetrievalToolCall,
  getAgentRetrievalToolDefinitions,
} from "../repository/agent-retrieval-tools";
import { BudgetedRetrievalRecord } from "../repository/retrieval-gateway";

export const AGENT_RETRIEVED_EPISODE_SCHEMA_VERSION =
  "agent-retrieved-episode-v5-search-repeat-tracking" as const;

export interface AgentRetrievedFinalizeDecision<TFinal = unknown> {
  kind: "finalize";
  value: TFinal;
}

export interface AgentRetrievedToolDecision {
  kind: "retrieve";
  call: AgentRetrievalToolCall;
}

export type AgentRetrievedDecision<TFinal = unknown> =
  | AgentRetrievedToolDecision
  | AgentRetrievedFinalizeDecision<TFinal>;

export interface AgentRetrievedEpisodeResult<TFinal = unknown> {
  schemaVersion: typeof AGENT_RETRIEVED_EPISODE_SCHEMA_VERSION;
  final: TFinal;
  telemetry: ResearchStatelessEpisodeTelemetry;
  retrievals: BudgetedRetrievalRecord[];
  observableSteps: RetrievedEpisodeObservableStep<AgentRetrievedDecision<TFinal>>[];
}

export interface AgentRetrievedEpisodeOptions<TFinal = unknown> {
  taskId: string;
  visibleInstruction: string;
  protocolId: string;
  repositoryFiles: Readonly<Record<string, string>>;
  workingSet: WorkingSetManager;
  explorationBudget: ExplorationBudget;
  executorFactory: ResearchStatelessStepExecutorFactory<AgentRetrievedDecision<TFinal>>;
}

/**
 * Thin AR policy adapter over the single P5 Step 6 RetrievedEpisodeRuntime.
 * AR contributes only the retrieval decision source: model-selected function
 * name/arguments. E_max, B_work, FIFO/reread and research-stateless inference are
 * owned by the shared runtime/gateway path.
 */
export class AgentRetrievedEpisode<TFinal = unknown> {
  private readonly runtime: RetrievedEpisodeRuntime<AgentRetrievedDecision<TFinal>, TFinal>;

  constructor(options: AgentRetrievedEpisodeOptions<TFinal>) {
    this.runtime = new RetrievedEpisodeRuntime<AgentRetrievedDecision<TFinal>, TFinal>({
      condition: "AR",
      taskId: options.taskId,
      visibleInstruction: options.visibleInstruction,
      protocolId: options.protocolId,
      repositoryFiles: options.repositoryFiles,
      workingSet: options.workingSet,
      explorationBudget: options.explorationBudget,
      executorFactory: options.executorFactory,
      policyFactory: (gateway) => {
        const tools = createAgentRetrievalTools(gateway);
        /**
         * Harness-side bookkeeping: tracks how many times each search query has
         * returned an empty result within this episode. This is evaluator-state,
         * not provider continuation state, and is exposed only through
         * nextObservation (the same channel as empty-retrieval-result). It does
         * not violate the research-stateless protocol.
         */
        const searchEmptyAttempts = new Map<string, number>();
        return {
          condition: "AR" as const,
          toolDefinitions: getAgentRetrievalToolDefinitions(tools),
          async resolve(decision: AgentRetrievedDecision<TFinal>) {
            if (decision.kind === "finalize") {
              return { kind: "finalize" as const, value: decision.value };
            }
            const result = await executeAgentRetrievalToolCall(tools, decision.call);
            if (result.evidence.length > 0) {
              return { kind: "retrieved" as const, repositoryAccessPerformed: true, nextObservation: null };
            }
            let message =
              "The retrieval completed successfully but returned no new observable repository evidence.";
            if (decision.call.toolName === "search") {
              const query = (decision.call.arguments as { query?: unknown }).query;
              if (typeof query === "string") {
                const prior = searchEmptyAttempts.get(query) ?? 0;
                searchEmptyAttempts.set(query, prior + 1);
                message +=
                  prior === 0
                    ? ` search("${query}") returned no results.`
                    : ` search("${query}") returned no results. This exact query has already been attempted ${prior} time(s) in this episode with no results.`;
              }
            }
            return {
              kind: "retrieved" as const,
              repositoryAccessPerformed: true,
              nextObservation: { kind: "empty-retrieval-result" as const, message },
            };
          },
        };
      },
    });
  }

  async run(): Promise<AgentRetrievedEpisodeResult<TFinal>> {
    const result = await this.runtime.run();
    return {
      schemaVersion: AGENT_RETRIEVED_EPISODE_SCHEMA_VERSION,
      final: result.final,
      telemetry: result.telemetry,
      retrievals: result.retrievals,
      observableSteps: result.observableSteps,
    };
  }

  /** Diagnostic trace when a provider failure is intentionally rethrown by the runtime. */
  failureSnapshot(message: string): RetrievedEpisodeRuntimeFailure<AgentRetrievedDecision<TFinal>> {
    return this.runtime.failureSnapshot(message);
  }
}
