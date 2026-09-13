import {
  ResearchStatelessEpisodeRunner,
  ResearchStatelessStepExecutorFactory,
  ResearchStatelessEpisodeTelemetry,
} from "./research-stateless-episode";
import { ExplorationBudget } from "./exploration-budget";
import { WorkingSetManager } from "./working-set-manager";
import {
  AgentRetrievalToolCall,
  createAgentRetrievalTools,
  executeAgentRetrievalToolCall,
  getAgentRetrievalToolDefinitions,
} from "../repository/agent-retrieval-tools";
import { BudgetedRepositoryGateway } from "../repository/retrieval-gateway";

export const AGENT_RETRIEVED_EPISODE_SCHEMA_VERSION =
  "agent-retrieved-episode-v1" as const;

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
  retrievals: ReturnType<BudgetedRepositoryGateway["records"]>;
}

export interface AgentRetrievedEpisodeOptions<TFinal = unknown> {
  taskId: string;
  visibleInstruction: string;
  protocolId: string;
  workingSet: WorkingSetManager;
  explorationBudget: ExplorationBudget;
  gateway: BudgetedRepositoryGateway;
  executorFactory: ResearchStatelessStepExecutorFactory<AgentRetrievedDecision<TFinal>>;
}

/**
 * P5 AR controller. The model chooses only a function name/arguments. The
 * controller executes that choice through BudgetedRepositoryGateway, then starts
 * a completely fresh reasoning step whose only repository-derived state is W_t.
 * No provider tool-result/history continuation is used.
 */
export class AgentRetrievedEpisode<TFinal = unknown> {
  private readonly tools;
  private readonly runner: ResearchStatelessEpisodeRunner<AgentRetrievedDecision<TFinal>>;

  constructor(private readonly options: AgentRetrievedEpisodeOptions<TFinal>) {
    this.tools = createAgentRetrievalTools(options.gateway);
    this.runner = new ResearchStatelessEpisodeRunner({
      condition: "AR",
      taskId: options.taskId,
      visibleInstruction: options.visibleInstruction,
      protocolId: options.protocolId,
      toolDefinitions: getAgentRetrievalToolDefinitions(this.tools),
      workingSet: options.workingSet,
      explorationBudget: options.explorationBudget,
      executorFactory: options.executorFactory,
    });
  }

  async run(): Promise<AgentRetrievedEpisodeResult<TFinal>> {
    while (true) {
      const step = await this.runner.runStep();
      if (step.decision.kind === "finalize") {
        return {
          schemaVersion: AGENT_RETRIEVED_EPISODE_SCHEMA_VERSION,
          final: step.decision.value,
          telemetry: this.runner.telemetry(),
          retrievals: this.options.gateway.records(),
        };
      }

      await executeAgentRetrievalToolCall(this.tools, step.decision.call);
      // The next loop iteration is a new inference. The raw tool result is not
      // replayed through provider history; admitted evidence appears via current W_t.
    }
  }
}
