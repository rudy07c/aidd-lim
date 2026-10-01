import * as crypto from "crypto";
import {
  assembleP63V3RSemBankStaticExposure,
  assembleP63V3TaskStaticExposure,
  P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION,
  type P63V3ExposureTaskDescriptor,
} from "../context/p6-3-v3-static-exposure-runtime";
import { P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION } from "../context/p6-3-v3-final-static-exposure-selector";
import {
  countStaticRepositoryPayloadTokens,
  serializeStaticRepositoryPayload,
} from "../context/static-exposure";
import {
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_EXECUTION_PROTOCOL_VERSION,
  buildP63CalibrationSchedule,
  type P63CalibrationArm,
} from "./p6-3-execution-protocol";
import type { P63ExposureEvidence } from "./p6-3-live-calibration-runner";
import {
  P6_3_V3_ARTIFACT_BUDGETS,
  P6_3_V3_CALIBRATION_PREDECLARATION,
  P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
  type P63V3ArmLabel,
} from "./p6-3-v3-calibration-predeclaration";
import {
  initializeP63V3RunStart,
  P6_3_V3_RUN_START_WIRING_VERSION,
  type P63V3RunStartContext,
  type P63V3RunStartDependencies,
  type P63V3RunStartPersistence,
} from "./p6-3-v3-run-start";
import {
  P6_3_V3_M_EXECUTION_RELIABILITY_VERSION,
  P6_3_V3_M_EXECUTOR_VERSION,
  P6_3_V3_M_PROVIDER_CONTRACT,
  P6_3_V3_M_RELIABILITY_SOURCE_VERSION,
} from "./p6-3-v3-m-executor";
import { P6_3_V3_RSEM_EXECUTOR_VERSION } from "./p6-3-v3-rsem-executor";

export const P6_3_V3_CALIBRATION_RUNNER_VERSION =
  "p6-3-v3-calibration-runner-v2-m-reliability" as const;
export const P6_3_V3_CALIBRATION_TREATMENT_PROVENANCE_SCHEMA =
  "p6-3-v3-calibration-treatment-provenance-v2-m-reliability" as const;

export type P63V3Measurement = "M" | "Rsem";

export interface P63V3CalibrationCell {
  readonly sequence: number;
  readonly measurement: P63V3Measurement;
  readonly taskId: string | null;
  readonly repeat: number;
  readonly blockKey: string;
  readonly armLabel: P63V3ArmLabel;
  readonly armKind: "EL" | "AF";
  readonly budgetTokens: number | "full";
}

export interface P63V3CalibrationTreatmentProvenance {
  readonly schemaVersion: typeof P6_3_V3_CALIBRATION_TREATMENT_PROVENANCE_SCHEMA;
  readonly runnerVersion: typeof P6_3_V3_CALIBRATION_RUNNER_VERSION;
  readonly predeclarationVersion: typeof P6_3_V3_CALIBRATION_PREDECLARATION_VERSION;
  readonly executionProtocolVersion: typeof P6_3_EXECUTION_PROTOCOL_VERSION;
  readonly staticExposureRuntimeVersion: typeof P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION;
  readonly finalSelectorVersion: typeof P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION;
  readonly runStartWiringVersion: typeof P6_3_V3_RUN_START_WIRING_VERSION;
  readonly mExecutorVersion: typeof P6_3_V3_M_EXECUTOR_VERSION;
  readonly mExecutionReliabilityVersion: typeof P6_3_V3_M_EXECUTION_RELIABILITY_VERSION;
  readonly mReliabilitySourceVersion: typeof P6_3_V3_M_RELIABILITY_SOURCE_VERSION;
  readonly mProviderMaxOutputTokens: number;
  readonly rsemExecutorVersion: typeof P6_3_V3_RSEM_EXECUTOR_VERSION;
  readonly fixedEnvironmentIdentity: string;
  readonly planHash: string;
  readonly logicalCellCount: number;
  readonly budgets: Readonly<typeof P6_3_V3_ARTIFACT_BUDGETS>;
  readonly repeatCount: number;
  readonly primaryMTaskIds: readonly string[];
  readonly rsemNamingSchemeId: string;
  readonly rsemBooleanProbeCount: number;
  readonly liveAuthorized: false;
}

export interface P63V3CalibrationPersistence extends P63V3RunStartPersistence {
  persistCalibrationTreatmentProvenance(
    provenance: Readonly<P63V3CalibrationTreatmentProvenance>
  ): void | Promise<void>;
}

export interface P63V3PreparedCalibrationRun {
  readonly plan: readonly P63V3CalibrationCell[];
  readonly planHash: string;
  readonly runStart: Readonly<P63V3RunStartContext>;
  readonly provenance: Readonly<P63V3CalibrationTreatmentProvenance>;
}

/**
 * Build the exact 864-cell v3 calibration plan from the merged predeclaration.
 * This intentionally does not call the historical v2 live runner.
 */
export function buildP63V3CalibrationPlan(): readonly P63V3CalibrationCell[] {
  if (P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount !== P6_3_CALIBRATION_REPEAT_COUNT) {
    throw new Error("P6-3 v3 predeclaration repeat count drifted from execution protocol");
  }
  const schedule = buildP63CalibrationSchedule();
  if (schedule.length !== P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount) {
    throw new Error("P6-3 v3 execution schedule length drifted from predeclaration");
  }

  const cells: P63V3CalibrationCell[] = [];
  let sequence = 0;
  for (const taskId of P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds) {
    for (const scheduled of schedule) {
      const blockKey = `M:${taskId}:repeat-${scheduled.repeat}`;
      for (const arm of scheduled.arms) {
        cells.push(freezeCell({
          sequence: sequence++,
          measurement: "M",
          taskId,
          repeat: scheduled.repeat,
          blockKey,
          arm,
        }));
      }
    }
  }
  for (const scheduled of schedule) {
    const blockKey = `Rsem:bank-${P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount}:repeat-${scheduled.repeat}`;
    for (const arm of scheduled.arms) {
      cells.push(freezeCell({
        sequence: sequence++,
        measurement: "Rsem",
        taskId: null,
        repeat: scheduled.repeat,
        blockKey,
        arm,
      }));
    }
  }

  if (cells.length !== P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedTotalLogicalCells) {
    throw new Error(`P6-3 v3 plan expected ${P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedTotalLogicalCells} cells, got ${cells.length}`);
  }
  const mCount = cells.filter((cell) => cell.measurement === "M").length;
  const rsemCount = cells.length - mCount;
  if (mCount !== P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedMLogicalCells) {
    throw new Error(`P6-3 v3 M plan count drift: ${mCount}`);
  }
  if (rsemCount !== P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedRSemLogicalCells) {
    throw new Error(`P6-3 v3 Rsem plan count drift: ${rsemCount}`);
  }
  assertBlockContiguity(cells);
  return Object.freeze(cells);
}

export function p63V3CalibrationPlanHash(
  plan: readonly P63V3CalibrationCell[]
): string {
  return sha256(stableJson(plan));
}

/**
 * Prepare a v3 calibration treatment family without executing a provider call.
 * Generation-0 E_fixed is built exactly once through initializeP63V3RunStart(),
 * then both run-fixed and complete treatment provenance are persisted before the
 * prepared object is returned.
 */
export async function prepareP63V3CalibrationRun(args: {
  generationZeroRepositoryFiles: Readonly<Record<string, string>>;
  persistence: P63V3CalibrationPersistence;
  runStartDependencies?: P63V3RunStartDependencies;
}): Promise<Readonly<P63V3PreparedCalibrationRun>> {
  if (P6_3_V3_CALIBRATION_PREDECLARATION.liveAuthorization !== false) {
    throw new Error("P6-3 v3 offline runner refuses a predeclaration that authorizes live execution");
  }
  const plan = buildP63V3CalibrationPlan();
  const planHash = p63V3CalibrationPlanHash(plan);
  const runStart = await initializeP63V3RunStart({
    generationZeroRepositoryFiles: args.generationZeroRepositoryFiles,
    persistence: args.persistence,
    dependencies: args.runStartDependencies,
  });

  const provenance: Readonly<P63V3CalibrationTreatmentProvenance> = Object.freeze({
    schemaVersion: P6_3_V3_CALIBRATION_TREATMENT_PROVENANCE_SCHEMA,
    runnerVersion: P6_3_V3_CALIBRATION_RUNNER_VERSION,
    predeclarationVersion: P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
    executionProtocolVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
    staticExposureRuntimeVersion: P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION,
    finalSelectorVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
    runStartWiringVersion: P6_3_V3_RUN_START_WIRING_VERSION,
    mExecutorVersion: P6_3_V3_M_EXECUTOR_VERSION,
    mExecutionReliabilityVersion: P6_3_V3_M_EXECUTION_RELIABILITY_VERSION,
    mReliabilitySourceVersion: P6_3_V3_M_RELIABILITY_SOURCE_VERSION,
    mProviderMaxOutputTokens: P6_3_V3_M_PROVIDER_CONTRACT.maxOutputTokens,
    rsemExecutorVersion: P6_3_V3_RSEM_EXECUTOR_VERSION,
    fixedEnvironmentIdentity: runStart.provenance.fixedEnvironmentIdentity,
    planHash,
    logicalCellCount: plan.length,
    budgets: P6_3_V3_ARTIFACT_BUDGETS,
    repeatCount: P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
    primaryMTaskIds: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds,
    rsemNamingSchemeId: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.namingSchemeId,
    rsemBooleanProbeCount: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount,
    liveAuthorized: false,
  });
  await args.persistence.persistCalibrationTreatmentProvenance(provenance);

  return Object.freeze({ plan, planHash, runStart, provenance });
}

/** Build artifact-only context and evidence for one v3 logical cell. */
export function buildP63V3CellExposure(args: {
  cell: Readonly<P63V3CalibrationCell>;
  repositoryFiles: Readonly<Record<string, string>>;
  syntheticWorldDir: string;
  taskById: ReadonlyMap<string, P63V3ExposureTaskDescriptor>;
  probePrompts: readonly string[];
}): { contextFiles: Record<string, string>; evidence: P63ExposureEvidence } {
  const fullTokens = countStaticRepositoryPayloadTokens(args.repositoryFiles);
  if (fullTokens !== P6_3_V3_CALIBRATION_PREDECLARATION.fullArtifactTokens) {
    throw new Error(`P6-3 v3 full artifact token count drift: ${fullTokens}`);
  }

  if (args.cell.armKind === "AF") {
    if (args.cell.budgetTokens !== "full") {
      throw new Error("P6-3 v3 AF cell must use full budget marker");
    }
    const payload = serializeStaticRepositoryPayload(args.repositoryFiles);
    return {
      contextFiles: { ...args.repositoryFiles },
      evidence: {
        mode: "AF-full",
        budgetTokens: "full",
        actualExposedTokens: fullTokens,
        fullRepositoryTokens: fullTokens,
        staticPayloadHash: sha256(payload),
        exposureSetHash: null,
        selectorPlanHash: null,
        selectedUnitCount: null,
      },
    };
  }

  if (typeof args.cell.budgetTokens !== "number") {
    throw new Error("P6-3 v3 EL cell requires numeric artifact budget");
  }
  const assembled = args.cell.measurement === "M"
    ? (() => {
        const task = args.taskById.get(args.cell.taskId ?? "");
        if (!task) throw new Error(`P6-3 v3 task not found: ${String(args.cell.taskId)}`);
        return assembleP63V3TaskStaticExposure({
          syntheticWorldDir: args.syntheticWorldDir,
          task,
          repositoryFiles: args.repositoryFiles,
          budgetTokens: args.cell.budgetTokens,
          maxTokensPerUnit: P6_3_V3_CALIBRATION_PREDECLARATION.artifactChunkMaxTokens,
        });
      })()
    : assembleP63V3RSemBankStaticExposure({
        syntheticWorldDir: args.syntheticWorldDir,
        probePrompts: args.probePrompts,
        namingSchemeId: P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.namingSchemeId,
        repositoryFiles: args.repositoryFiles,
        budgetTokens: args.cell.budgetTokens,
        maxTokensPerUnit: P6_3_V3_CALIBRATION_PREDECLARATION.artifactChunkMaxTokens,
      });

  if (assembled.log.fullRepositoryTokens !== fullTokens) {
    throw new Error("P6-3 v3 exposure full repository tokens drifted");
  }
  if (assembled.log.budgetTokens !== args.cell.budgetTokens) {
    throw new Error("P6-3 v3 exposure budget drifted from logical cell");
  }
  if (assembled.log.actualExposedTokens > args.cell.budgetTokens) {
    throw new Error("P6-3 v3 artifact exposure exceeded B_expose");
  }
  if (!assembled.log.selectorId.includes(P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION)) {
    throw new Error("P6-3 v3 artifact exposure was not produced by final selector identity");
  }

  return {
    contextFiles: assembled.contextFiles,
    evidence: {
      mode: "EL-static",
      budgetTokens: assembled.log.budgetTokens,
      actualExposedTokens: assembled.log.actualExposedTokens,
      fullRepositoryTokens: assembled.log.fullRepositoryTokens,
      staticPayloadHash: assembled.log.staticPayloadHash,
      exposureSetHash: assembled.log.exposureSetHash,
      selectorPlanHash: assembled.log.selectorPlanHash,
      selectedUnitCount: assembled.log.selectedUnitCount,
    },
  };
}

function freezeCell(args: {
  sequence: number;
  measurement: P63V3Measurement;
  taskId: string | null;
  repeat: number;
  blockKey: string;
  arm: P63CalibrationArm;
}): P63V3CalibrationCell {
  return Object.freeze({
    sequence: args.sequence,
    measurement: args.measurement,
    taskId: args.taskId,
    repeat: args.repeat,
    blockKey: args.blockKey,
    armLabel: args.arm.label,
    armKind: args.arm.kind,
    budgetTokens: args.arm.kind === "AF"
      ? "full"
      : P6_3_V3_ARTIFACT_BUDGETS[args.arm.label],
  });
}

function assertBlockContiguity(cells: readonly P63V3CalibrationCell[]): void {
  const completed = new Set<string>();
  let active: string | null = null;
  for (const cell of cells) {
    if (cell.blockKey !== active) {
      if (active !== null) completed.add(active);
      if (completed.has(cell.blockKey)) {
        throw new Error(`P6-3 v3 calibration block is non-contiguous: ${cell.blockKey}`);
      }
      active = cell.blockKey;
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
