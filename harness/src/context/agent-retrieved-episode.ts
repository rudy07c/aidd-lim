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
  "agent-retrieved-episode-v4-empty-result-observable" as const;

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
        return {
          condition: "AR" as const,
          toolDefinitions: getAgentRetrievalToolDefinitions(tools),
          async resolve(decision: AgentRetrievedDecision<TFinal>) {
            if (decision.kind === "finalize") {
              return { kind: "finalize" as const, value: decision.value };
            }
            const result = await executeAgentRetrievalToolCall(tools, decision.call);
            return {
              kind: "retrieved" as const,
              repositoryAccessPerformed: true,
              nextObservation: result.evidence.length === 0
                ? {
                    kind: "empty-retrieval-result" as const,
                    message:
                      "The retrieval completed successfully but returned no new observable repository evidence. Decide from the current working set and explicit memory, or choose another retrieval action if E_max permits.",
                  }
                : null,
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
