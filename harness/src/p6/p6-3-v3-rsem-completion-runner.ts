import * as crypto from "crypto";
import {
  P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
} from "../context/p6-3-v3-final-static-exposure-selector";
import {
  P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION,
} from "../context/p6-3-v3-static-exposure-runtime";
import type { P63ExposureEvidence } from "./p6-3-live-calibration-runner";
import {
  buildP63V3CellExposure,
  type P63V3CalibrationCell,
} from "./p6-3-v3-calibration-runner";
import {
  initializeP63V3RunStart,
  P6_3_V3_RUN_START_WIRING_VERSION,
  type P63V3RunStartContext,
  type P63V3RunStartDependencies,
  type P63V3RunStartPersistence,
} from "./p6-3-v3-run-start";
import {
  P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
  executeP63V3RSemCompletionCell,
} from "./p6-3-v3-rsem-completion-executor";
import {
  buildP63V3RSemCompletionPlan,
  p63V3RSemCompletionPlanHash,
  P6_3_V3_RSEM_COMPLETION_PLAN_VERSION,
  type P63V3RSemCompletionCell,
} from "./p6-3-v3-rsem-completion-plan";
import {
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
} from "./p6-3-v3-rsem-completion-predeclaration";

export const P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION =
  "p6-3-v3-rsem-completion-runner-v1" as const;
export const P6_3_V3_RSEM_COMPLETION_PROVENANCE_SCHEMA =
  "p6-3-v3-rsem-completion-treatment-provenance-v1" as const;

export interface P63V3RSemCompletionTreatmentProvenance {
  readonly schemaVersion:
    typeof P6_3_V3_RSEM_COMPLETION_PROVENANCE_SCHEMA;
  readonly runnerVersion:
    typeof P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION;
  readonly predeclarationVersion:
    typeof P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION;
  readonly planVersion:
    typeof P6_3_V3_RSEM_COMPLETION_PLAN_VERSION;
  readonly runStartWiringVersion:
    typeof P6_3_V3_RUN_START_WIRING_VERSION;
  readonly staticExposureRuntimeVersion:
    typeof P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION;
  readonly finalSelectorVersion:
    typeof P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION;
  readonly executorVersion:
    typeof P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION;
  readonly runClass: "scientific-calibration-completion";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly fixedEnvironmentIdentity: string;
  readonly planHash: string;
  readonly freshRSemLogicalCells: number;
  readonly canonicalV3SequenceRange: readonly [792, 863];
  readonly inheritedMLogicalCells: number;
  readonly inheritedMSourceStateSha256: string;
  readonly inheritedMSemanticSha256: string;
  readonly providerMaxOutputTokens: number;
  readonly providerMaxRetries: number;
  readonly stoppedRunRSemReuseAllowed: false;
  readonly reliabilityAuditPoolingAllowed: false;
  readonly liveAuthorized: false;
}

export interface P63V3RSemCompletionPersistence
  extends P63V3RunStartPersistence {
  persistRSemCompletionTreatmentProvenance(
    provenance: Readonly<P63V3RSemCompletionTreatmentProvenance>
  ): void | Promise<void>;
}

export type P63V3RSemCompletionRunStartContext = Readonly<
  Pick<
    P63V3RunStartContext,
    "fixedEnvironment" | "provenance" | "executeRSemCell"
  >
>;

export type P63V3RSemCompletionRunStartDependencies = Readonly<
  Pick<P63V3RunStartDependencies, "buildFixedEnvironment">
>;

export interface P63V3PreparedRSemCompletionRun {
  readonly plan: readonly P63V3RSemCompletionCell[];
  readonly planHash: string;
  readonly runStart: P63V3RSemCompletionRunStartContext;
  readonly provenance:
    Readonly<P63V3RSemCompletionTreatmentProvenance>;
}

export function buildP63V3RSemCompletionTreatmentProvenance(args: {
  fixedEnvironmentIdentity: string;
  planHash: string;
}): Readonly<P63V3RSemCompletionTreatmentProvenance> {
  if (
    args.fixedEnvironmentIdentity !==
    P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion provenance fixed-environment identity drift"
    );
  }
  if (
    args.planHash !==
    P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion provenance plan hash drift"
    );
  }
  return Object.freeze({
    schemaVersion:
      P6_3_V3_RSEM_COMPLETION_PROVENANCE_SCHEMA,
    runnerVersion:
      P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION,
    predeclarationVersion:
      P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
    planVersion:
      P6_3_V3_RSEM_COMPLETION_PLAN_VERSION,
    runStartWiringVersion:
      P6_3_V3_RUN_START_WIRING_VERSION,
    staticExposureRuntimeVersion:
      P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION,
    finalSelectorVersion:
      P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
    executorVersion:
      P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
    runClass: "scientific-calibration-completion",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    fixedEnvironmentIdentity:
      args.fixedEnvironmentIdentity,
    planHash: args.planHash,
    freshRSemLogicalCells:
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
    canonicalV3SequenceRange: Object.freeze(
      [792, 863] as const
    ),
    inheritedMLogicalCells:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
    inheritedMSourceStateSha256:
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
    inheritedMSemanticSha256:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
    providerMaxOutputTokens:
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
    providerMaxRetries:
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
    stoppedRunRSemReuseAllowed: false,
    reliabilityAuditPoolingAllowed: false,
    liveAuthorized: false,
  });
}

export function p63V3RSemCompletionTreatmentProvenanceHash(
  provenance: Readonly<P63V3RSemCompletionTreatmentProvenance>
): string {
  return sha256(stableJson(provenance));
}

export async function prepareP63V3RSemCompletionRun(args: {
  generationZeroRepositoryFiles: Readonly<Record<string, string>>;
  persistence: P63V3RSemCompletionPersistence;
  runStartDependencies?: P63V3RSemCompletionRunStartDependencies;
}): Promise<Readonly<P63V3PreparedRSemCompletionRun>> {
  if (P6_3_V3_RSEM_COMPLETION_PREDECLARATION.liveAuthorization !== false) {
    throw new Error(
      "P6-3 v3 Rsem completion runner refuses a predeclaration that authorizes live execution"
    );
  }
  const plan = buildP63V3RSemCompletionPlan();
  const planHash = p63V3RSemCompletionPlanHash(plan);
  if (
    plan.length !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS ||
    planHash !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion plan drifted from the frozen predeclaration"
    );
  }

  const rawDependencies =
    args.runStartDependencies as Record<string, unknown> | undefined;
  if (
    rawDependencies &&
    ("executeRSemCell" in rawDependencies ||
      "executeMCell" in rawDependencies)
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion forbids executor overrides; the 32k completion executor is mandatory and M execution is disabled"
    );
  }

  const fullRunStart = await initializeP63V3RunStart({
    generationZeroRepositoryFiles:
      args.generationZeroRepositoryFiles,
    persistence: args.persistence,
    dependencies: {
      buildFixedEnvironment:
        args.runStartDependencies?.buildFixedEnvironment,
      executeRSemCell: executeP63V3RSemCompletionCell,
    },
  });
  const runStart: P63V3RSemCompletionRunStartContext =
    Object.freeze({
      fixedEnvironment: fullRunStart.fixedEnvironment,
      provenance: fullRunStart.provenance,
      executeRSemCell: fullRunStart.executeRSemCell,
    });
  if (
    runStart.provenance.fixedEnvironmentIdentity !==
    P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion fixed-environment identity does not match the inherited M source"
    );
  }

  const provenance =
    buildP63V3RSemCompletionTreatmentProvenance({
      fixedEnvironmentIdentity:
        runStart.provenance.fixedEnvironmentIdentity,
      planHash,
    });
  await args.persistence.persistRSemCompletionTreatmentProvenance(
    provenance
  );

  return Object.freeze({
    plan,
    planHash,
    runStart,
    provenance,
  });
}

export function buildP63V3RSemCompletionCellExposure(args: {
  cell: Readonly<P63V3RSemCompletionCell>;
  repositoryFiles: Readonly<Record<string, string>>;
  syntheticWorldDir: string;
  probePrompts: readonly string[];
}): {
  contextFiles: Record<string, string>;
  evidence: P63ExposureEvidence;
} {
  const canonicalCell: P63V3CalibrationCell = {
    sequence: args.cell.canonicalV3Sequence,
    measurement: "Rsem",
    taskId: null,
    repeat: args.cell.repeat,
    blockKey: args.cell.blockKey,
    armLabel: args.cell.armLabel,
    armKind: args.cell.armKind,
    budgetTokens: args.cell.budgetTokens,
  };
  const exposure = buildP63V3CellExposure({
    cell: canonicalCell,
    repositoryFiles: args.repositoryFiles,
    syntheticWorldDir: args.syntheticWorldDir,
    taskById: new Map(),
    probePrompts: args.probePrompts,
  });
  if (
    exposure.evidence.budgetTokens !==
    args.cell.budgetTokens
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion exposure budget drifted from the frozen cell"
    );
  }
  return exposure;
}

export function p63V3RSemCompletionProvenanceHash(
  prepared: Readonly<P63V3PreparedRSemCompletionRun>
): string {
  return p63V3RSemCompletionTreatmentProvenanceHash(
    prepared.provenance
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            stableJson(record[key])
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}
