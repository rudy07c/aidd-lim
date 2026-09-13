import {
  ResearchStatelessEpisodeTelemetry,
  ResearchStatelessStepExecutorFactory,
  ResearchStatelessToolDefinition,
} from "./research-stateless-episode";
import { RetrievedEpisodeRuntime } from "./retrieved-episode-runtime";
import { ExplorationBudget } from "./exploration-budget";
import { WorkingSetManager } from "./working-set-manager";
import {
  PrivilegedRetrievalController,
  PrivilegedRetrievalControllerOptions,
  PrivilegedRetrievalPlan,
} from "./privileged-retrieval-controller";
import { BudgetedRetrievalRecord } from "../repository/retrieval-gateway";
import {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../../../synthetic-world/schema";

export const PRIVILEGED_RETRIEVED_EPISODE_SCHEMA_VERSION =
  "privileged-retrieved-episode-v1-shared-runtime" as const;

export interface PrivilegedRetrievedFinalizeDecision<TFinal = unknown> {
  kind: "finalize";
  value: TFinal;
}

export interface PrivilegedRetrievedNextDecision {
  kind: "retrieve";
}

export type PrivilegedRetrievedDecision<TFinal = unknown> =
  | PrivilegedRetrievedNextDecision
  | PrivilegedRetrievedFinalizeDecision<TFinal>;

export interface PrivilegedRetrievedEpisodeResult<TFinal = unknown> {
  schemaVersion: typeof PRIVILEGED_RETRIEVED_EPISODE_SCHEMA_VERSION;
  final: TFinal;
  telemetry: ResearchStatelessEpisodeTelemetry;
  retrievals: BudgetedRetrievalRecord[];
  retrievalPlan: PrivilegedRetrievalPlan;
}

export interface PrivilegedRetrievedEpisodeOptions<TFinal = unknown> {
  taskId: string;
  visibleInstruction: string;
  protocolId: string;
  repositoryFiles: Readonly<Record<string, string>>;
  groundTruth: GroundTruth;
  delta: GroundTruthDelta;
  namingScheme: NamingScheme;
  workingSet: WorkingSetManager;
  explorationBudget: ExplorationBudget;
  executorFactory: ResearchStatelessStepExecutorFactory<PrivilegedRetrievedDecision<TFinal>>;
}

/**
 * PR exposes only the ability to request the next privileged evidence item. The
 * worker never chooses the path and never receives GroundTruth-derived ranking
 * explanations. PrivilegedRetrievalController is the sole source of "what to
 * read" while the shared runtime remains identical to AR.
 */
const PR_RETRIEVE_NEXT_TOOL: ResearchStatelessToolDefinition = Object.freeze({
  name: "retrieve_next",
  description: "Request the next repository evidence item selected by the privileged deterministic retrieval policy.",
  parameters: Object.freeze({
    type: "object",
    properties: Object.freeze({}),
    required: Object.freeze([]),
    additionalProperties: false,
  }),
});

export class PrivilegedRetrievedEpisode<TFinal = unknown> {
  private readonly runtime: RetrievedEpisodeRuntime<PrivilegedRetrievedDecision<TFinal>, TFinal>;
  private readonly controller: PrivilegedRetrievalController;

  constructor(options: PrivilegedRetrievedEpisodeOptions<TFinal>) {
    let controller!: PrivilegedRetrievalController;
    this.runtime = new RetrievedEpisodeRuntime({
      condition: "PR",
      taskId: options.taskId,
      visibleInstruction: options.visibleInstruction,
      protocolId: options.protocolId,
      repositoryFiles: options.repositoryFiles,
      workingSet: options.workingSet,
      explorationBudget: options.explorationBudget,
      executorFactory: options.executorFactory,
      policyFactory: (gateway) => {
        const controllerOptions: PrivilegedRetrievalControllerOptions = {
          groundTruth: options.groundTruth,
          delta: options.delta,
          namingScheme: options.namingScheme,
          repositoryFiles: options.repositoryFiles,
          gateway,
        };
        controller = new PrivilegedRetrievalController(controllerOptions);
        return {
          condition: "PR" as const,
          toolDefinitions: Object.freeze([PR_RETRIEVE_NEXT_TOOL]),
          async resolve(decision: PrivilegedRetrievedDecision<TFinal>) {
            if (decision.kind === "finalize") {
              return { kind: "finalize" as const, value: decision.value };
            }
            const execution = await controller.retrieveNext();
            if (!execution) {
              throw new Error("Privileged retrieval plan exhausted before finalization");
            }
            return { kind: "retrieved" as const };
          },
        };
      },
    });
    this.controller = controller;
  }

  async run(): Promise<PrivilegedRetrievedEpisodeResult<TFinal>> {
    const result = await this.runtime.run();
    return {
      schemaVersion: PRIVILEGED_RETRIEVED_EPISODE_SCHEMA_VERSION,
      final: result.final,
      telemetry: result.telemetry,
      retrievals: result.retrievals,
      retrievalPlan: this.controller.retrievalPlan,
    };
  }
}
