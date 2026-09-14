import {
  ResearchStatelessEpisodeTelemetry,
  ResearchStatelessStepExecutorFactory,
  ResearchStatelessToolDefinition,
} from "./research-stateless-episode";
import {
  RetrievedEpisodeObservableStep,
  RetrievedEpisodeRuntime,
} from "./retrieved-episode-runtime";
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
  "privileged-retrieved-episode-v3-bounded-note" as const;

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
  observableSteps: RetrievedEpisodeObservableStep<PrivilegedRetrievedDecision<TFinal>>[];
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
 * PR worker can only request the next privileged evidence item. It may attach a
 * bounded workingNote to that retrieval decision; the note is accounted by the
 * shared ResearchStatelessEpisodeRunner before the controller touches repository
 * evidence. GroundTruth-derived ranking details remain evaluator-side only.
 */
export const PR_RETRIEVE_NEXT_TOOL: ResearchStatelessToolDefinition = Object.freeze({
  name: "retrieve_next",
  description: "Request the next repository evidence item selected by the privileged deterministic retrieval policy. Include a bounded workingNote (or null) for the next fresh step.",
  parameters: Object.freeze({
    type: "object",
    properties: Object.freeze({
      workingNote: Object.freeze({ type: ["string", "null"] }),
    }),
    required: Object.freeze(["workingNote"]),
    additionalProperties: false,
  }),
});

export class PrivilegedRetrievedEpisode<TFinal = unknown> {
  private readonly runtime: RetrievedEpisodeRuntime<PrivilegedRetrievedDecision<TFinal>, TFinal>;
  private readonly controller: PrivilegedRetrievalController;

  constructor(options: PrivilegedRetrievedEpisodeOptions<TFinal>) {
    let controller!: PrivilegedRetrievalController;
    this.runtime = new RetrievedEpisodeRuntime<PrivilegedRetrievedDecision<TFinal>, TFinal>({
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
      observableSteps: result.observableSteps,
      retrievalPlan: this.controller.retrievalPlan,
    };
  }

  /** Read-only evaluator-side provenance for failure logging. */
  retrievalPlanSnapshot(): PrivilegedRetrievalPlan {
    return JSON.parse(JSON.stringify(this.controller.retrievalPlan)) as PrivilegedRetrievalPlan;
  }
}
