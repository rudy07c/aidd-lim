import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import type { P63MutationTask } from "./p6-3-live-executors";
import {
  executeP63V2MCell,
  executeP63V2RSemCell,
  type P63V2MutationBackendFactory,
  type P63V2RSemRunner,
} from "./p6-3-v2-live-executors";
import {
  assertP63V2ResumeCompatible,
  createP63V2CalibrationState,
  executeP63V2Calibration,
  summarizeP63V2ExecutionState,
  type P63V2CalibrationExecutor,
  type P63V2CalibrationPersistence,
  type P63V2CalibrationState,
  type P63V2ExecutionPolicy,
} from "./p6-3-v2-live-calibration-runner";
import {
  P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA,
  summarizeP63V2SecondaryReliability,
  withP63V2SecondaryReliability,
  type P63V2ReliabilityAttemptArtifact,
  type P63V2ReliabilityCellOutcome,
  type P63V2SecondaryReliabilitySummary,
} from "./p6-3-v2-secondary-reliability";
import type {
  P63CalibrationCell,
  P63ExposureEvidence,
} from "./p6-3-live-calibration-runner";

export const P6_3_V2_END_TO_END_REPORT_SCHEMA =
  "p6-3-v2-end-to-end-report-v1" as const;

export interface P63V2MCellInputs {
  readonly contextFiles: Record<string, string>;
  readonly evaluationRepository: Record<string, string>;
  readonly syntheticWorldDir: string;
  readonly task: P63MutationTask;
  readonly exposure: P63ExposureEvidence;
}

export interface P63V2RSemCellInputs {
  readonly contextFiles: Record<string, string>;
  readonly probes: GeneratedProbe[];
  readonly exposure: P63ExposureEvidence;
}

export interface P63V2CellInputResolver {
  resolveM(cell: P63CalibrationCell): P63V2MCellInputs | Promise<P63V2MCellInputs>;
  resolveRSem(cell: P63CalibrationCell): P63V2RSemCellInputs | Promise<P63V2RSemCellInputs>;
}

export interface P63V2EndToEndPersistence extends P63V2CalibrationPersistence {
  loadAttemptArtifact(artifactPath: string): unknown;
  persistFinalReport(report: P63V2EndToEndReport): string | Promise<string>;
}

export interface P63V2EndToEndReport {
  readonly schemaVersion: typeof P6_3_V2_END_TO_END_REPORT_SCHEMA;
  readonly runClass: "scientific-calibration";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly checkoutGitSha: string;
  readonly frozenManifestHashes: Readonly<Record<string, string>>;
  readonly planHash: string;
  readonly executionPolicy: P63V2ExecutionPolicy;
  readonly execution: ReturnType<typeof summarizeP63V2ExecutionState>;
  readonly reliability: P63V2SecondaryReliabilitySummary;
}

export interface P63V2EndToEndResult {
  readonly state: P63V2CalibrationState;
  readonly execution: ReturnType<typeof summarizeP63V2ExecutionState>;
  readonly finalReport: P63V2EndToEndReport | null;
  readonly finalReportPath: string | null;
}

export function createP63V2ProviderExecutor(args: {
  resolver: P63V2CellInputResolver;
  mutationBackendFactory?: P63V2MutationBackendFactory;
  rsemRunner?: P63V2RSemRunner;
}): { execute(cell: P63CalibrationCell, attempt: number): Promise<P63V2ReliabilityCellOutcome> } {
  return {
    async execute(cell): Promise<P63V2ReliabilityCellOutcome> {
      if (cell.measurement === "M") {
        const input = await args.resolver.resolveM(cell);
        assertMInputMatchesCell(cell, input);
        return executeP63V2MCell({
          contextFiles: input.contextFiles,
          evaluationRepository: input.evaluationRepository,
          syntheticWorldDir: input.syntheticWorldDir,
          task: input.task,
          repeat: cell.repeat,
          contextBudget: cell.budgetTokens,
          exposure: input.exposure,
          backendFactory: args.mutationBackendFactory,
        });
      }

      const input = await args.resolver.resolveRSem(cell);
      assertRSemInputMatchesCell(cell, input);
      return executeP63V2RSemCell({
        contextFiles: input.contextFiles,
        probes: input.probes,
        repeat: cell.repeat,
        exposure: input.exposure,
        rsemRunner: args.rsemRunner,
      });
    },
  };
}

export async function runP63V2EndToEnd(args: {
  state: P63V2CalibrationState;
  identity: {
    checkoutGitSha: string;
    frozenManifestHashes: Readonly<Record<string, string>>;
    executionPolicy: P63V2ExecutionPolicy;
  };
  plan: readonly P63CalibrationCell[];
  rawExecutor: {
    execute(cell: P63CalibrationCell, attempt: number): Promise<P63V2ReliabilityCellOutcome>;
  };
  persistence: P63V2EndToEndPersistence;
}): Promise<P63V2EndToEndResult> {
  const executor: P63V2CalibrationExecutor = withP63V2SecondaryReliability(args.rawExecutor);
  const state = await executeP63V2Calibration(
    args.state,
    args.identity,
    args.plan,
    executor,
    args.persistence
  );
  const execution = summarizeP63V2ExecutionState(state);

  if (!execution.collectionComplete) {
    return {
      state,
      execution,
      finalReport: null,
      finalReportPath: null,
    };
  }

  const reliability = summarizeP63V2SecondaryReliability({
    state,
    plan: args.plan,
    loadAttemptArtifact: (artifactPath) => args.persistence.loadAttemptArtifact(artifactPath),
  });
  const report = buildFinalReport(state, execution, reliability);
  const finalReportPath = await args.persistence.persistFinalReport(report);
  return {
    state,
    execution,
    finalReport: report,
    finalReportPath,
  };
}

export function loadOrCreateP63V2State(args: {
  statePath: string;
  checkoutGitSha: string;
  frozenManifestHashes: Readonly<Record<string, string>>;
  plan: readonly P63CalibrationCell[];
  executionPolicy: P63V2ExecutionPolicy;
}): { state: P63V2CalibrationState; resumed: boolean } {
  if (!fs.existsSync(args.statePath)) {
    return {
      state: createP63V2CalibrationState({
        checkoutGitSha: args.checkoutGitSha,
        frozenManifestHashes: args.frozenManifestHashes,
        plan: args.plan,
        executionPolicy: args.executionPolicy,
      }),
      resumed: false,
    };
  }

  const state = JSON.parse(fs.readFileSync(args.statePath, "utf8")) as P63V2CalibrationState;
  assertP63V2ResumeCompatible(state, {
    checkoutGitSha: args.checkoutGitSha,
    frozenManifestHashes: args.frozenManifestHashes,
    plan: args.plan,
    executionPolicy: args.executionPolicy,
  });
  return { state, resumed: true };
}

export function createP63V2FilePersistence(args: {
  statePath: string;
  finalReportPath?: string;
}): P63V2EndToEndPersistence {
  const statePath = path.resolve(args.statePath);
  const runDir = path.dirname(statePath);
  const finalReportPath = path.resolve(
    args.finalReportPath ?? path.join(runDir, "final-report.json")
  );

  return {
    persistState: (state) => {
      writeJsonAtomic(statePath, state);
    },
    persistAttemptArtifact: (cell, attempt, payload) => {
      assertReliabilityArtifactIdentity(payload, cell, attempt);
      const targetDir = path.join(
        runDir,
        "attempts",
        `cell-${String(cell.sequence).padStart(4, "0")}-${cell.measurement.toLowerCase()}-${safe(cell.taskId ?? "bank-12")}-${cell.arm.label}`
      );
      const target = path.join(targetDir, `attempt-${attempt}.json`);
      if (fs.existsSync(target)) {
        throw new Error(`P6-3 v2 attempt artifact already exists: ${target}`);
      }
      writeJsonAtomic(target, payload);
      return path.relative(runDir, target).replace(/\\/g, "/");
    },
    loadAttemptArtifact: (artifactPath) => {
      const target = resolveWithinRunDir(runDir, artifactPath);
      return JSON.parse(fs.readFileSync(target, "utf8"));
    },
    persistFinalReport: (report) => {
      if (report.execution.collectionComplete !== true) {
        throw new Error("P6-3 v2 final report persistence requires terminal collection");
      }
      writeJsonImmutableOrSame(finalReportPath, report);
      return path.relative(runDir, finalReportPath).replace(/\\/g, "/");
    },
  };
}

function buildFinalReport(
  state: P63V2CalibrationState,
  execution: ReturnType<typeof summarizeP63V2ExecutionState>,
  reliability: P63V2SecondaryReliabilitySummary
): P63V2EndToEndReport {
  if (!execution.collectionComplete) {
    throw new Error("P6-3 v2 final report requires terminal collection");
  }
  if (reliability.collectionStatus !== state.status) {
    throw new Error("P6-3 v2 final report refused: execution/reliability status mismatch");
  }
  if (reliability.committedAttemptCount !== state.attempts.length) {
    throw new Error("P6-3 v2 final report refused: committed attempt count mismatch");
  }
  if (reliability.interruptedAttemptCount !== state.interruptedAttempts.length) {
    throw new Error("P6-3 v2 final report refused: interrupted attempt count mismatch");
  }
  if (reliability.exhaustedCellLocations.length !== state.exhaustedCells.length) {
    throw new Error("P6-3 v2 final report refused: exhausted-cell count mismatch");
  }
  const expectedSelectionEligibility =
    state.status === "completed" && state.exhaustedCells.length === 0;
  if (execution.bExposeSelectionEligible !== expectedSelectionEligibility) {
    throw new Error("P6-3 v2 final report refused: B_expose selection eligibility mismatch");
  }

  return {
    schemaVersion: P6_3_V2_END_TO_END_REPORT_SCHEMA,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    checkoutGitSha: state.checkoutGitSha,
    frozenManifestHashes: { ...state.frozenManifestHashes },
    planHash: state.planHash,
    executionPolicy: { ...state.executionPolicy },
    execution,
    reliability,
  };
}

function assertMInputMatchesCell(cell: P63CalibrationCell, input: P63V2MCellInputs): void {
  if (cell.measurement !== "M") throw new Error("P6-3 v2 M resolver used for non-M cell");
  if (cell.taskId === null || input.task.taskId !== cell.taskId) {
    throw new Error("P6-3 v2 M resolver task identity mismatch");
  }
  assertExposureMatchesCell(cell, input.exposure);
}

function assertRSemInputMatchesCell(
  cell: P63CalibrationCell,
  input: P63V2RSemCellInputs
): void {
  if (cell.measurement !== "Rsem") throw new Error("P6-3 v2 Rsem resolver used for non-Rsem cell");
  if (cell.taskId !== null) throw new Error("P6-3 v2 Rsem cell unexpectedly has taskId");
  assertExposureMatchesCell(cell, input.exposure);
}

function assertExposureMatchesCell(
  cell: P63CalibrationCell,
  exposure: P63ExposureEvidence
): void {
  const expectedMode = cell.arm.kind === "AF" ? "AF-full" : "EL-static";
  if (exposure.mode !== expectedMode) {
    throw new Error("P6-3 v2 resolved exposure mode does not match logical arm kind");
  }
  if (exposure.budgetTokens !== cell.budgetTokens) {
    throw new Error("P6-3 v2 resolved exposure budget does not match logical cell");
  }
}

function assertReliabilityArtifactIdentity(
  value: unknown,
  cell: P63CalibrationCell,
  attempt: number
): asserts value is P63V2ReliabilityAttemptArtifact {
  if (!value || typeof value !== "object") {
    throw new Error("P6-3 v2 persistence requires a reliability attempt artifact object");
  }
  const artifact = value as Partial<P63V2ReliabilityAttemptArtifact>;
  if (artifact.schemaVersion !== P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA) {
    throw new Error("P6-3 v2 persistence requires the secondary reliability wrapper at artifact root");
  }
  const identity = artifact.identity;
  if (
    !identity ||
    identity.sequence !== cell.sequence ||
    identity.measurement !== cell.measurement ||
    identity.taskId !== cell.taskId ||
    identity.repeat !== cell.repeat ||
    identity.armLabel !== cell.arm.label ||
    identity.attempt !== attempt
  ) {
    throw new Error("P6-3 v2 persistence reliability artifact identity mismatch");
  }
}

function writeJsonAtomic(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, target);
}

function writeJsonImmutableOrSame(target: string, value: unknown): void {
  const next = JSON.stringify(value, null, 2) + "\n";
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, "utf8");
    if (current !== next) {
      throw new Error(`P6-3 v2 immutable report already exists with different content: ${target}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, next, "utf8");
  fs.renameSync(tmp, target);
}

function resolveWithinRunDir(runDir: string, artifactPath: string): string {
  if (!artifactPath || path.isAbsolute(artifactPath)) {
    throw new Error("P6-3 v2 artifact path must be a non-empty relative path");
  }
  const target = path.resolve(runDir, artifactPath);
  const prefix = `${path.resolve(runDir)}${path.sep}`;
  if (!target.startsWith(prefix)) {
    throw new Error("P6-3 v2 artifact path escapes run directory");
  }
  return target;
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}
