import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import type { GroundTruthDelta } from "../../../synthetic-world/schema";
import {
  buildP63V3CellExposure,
  prepareP63V3CalibrationRun,
  type P63V3CalibrationTreatmentProvenance,
  type P63V3PreparedCalibrationRun,
} from "./p6-3-v3-calibration-runner";
import { P6_3_V3_CALIBRATION_PREDECLARATION } from "./p6-3-v3-calibration-predeclaration";
import {
  applyP63V3Adjudication,
  assertP63V3ResumeCompatible,
  authorizeP63V3PaidLiveInvocation,
  createP63V3LiveCalibrationState,
  executeP63V3ControlledCalibration,
  recoverInterruptedP63V3State,
  summarizeP63V3ExecutionState,
  type P63V3AdjudicationRequest,
  type P63V3LiveCalibrationState,
  type P63V3LiveControllerPersistence,
  type P63V3PaidLiveRuntimeAuthorizationToken,
} from "./p6-3-v3-live-controller";
import {
  assertP63V3FinalPreLiveGatePassToken,
  type P63V3FinalPreLiveGatePassToken,
} from "./p6-3-v3-final-prelive-gate";
import type {
  P63V3RunFixedEnvironmentProvenance,
  P63V3RunStartDependencies,
} from "./p6-3-v3-run-start";
import type { P63V3ExposureTaskDescriptor } from "../context/p6-3-v3-static-exposure-runtime";

export const P6_3_V3_LIVE_ENTRYPOINT_VERSION =
  "p6-3-v3-live-entrypoint-v1" as const;

const PRELIVE_RECEIPT_FILE = "p6-3-v3-final-prelive-receipt.json";
const FIXED_ENVIRONMENT_PROVENANCE_FILE = "fixed-environment-run.json";
const TREATMENT_PROVENANCE_FILE = "treatment-provenance.json";

interface P63V3RuntimeTask extends P63V3ExposureTaskDescriptor {
  readonly taskId: string;
  readonly type?: string;
  readonly visibleInstruction: string;
  readonly taskSpecificTestCode?: string;
  readonly namingScheme: string;
  readonly groundTruthDelta: GroundTruthDelta;
}

interface RuntimeInputs {
  readonly repositoryFiles: Readonly<Record<string, string>>;
  readonly taskById: ReadonlyMap<string, P63V3RuntimeTask>;
  readonly probes: readonly GeneratedProbe[];
  readonly probePrompts: readonly string[];
  readonly syntheticWorldDir: string;
}

export interface P63V3LiveEntrypointTestDependencies {
  readonly runStartDependencies?: P63V3RunStartDependencies;
  readonly newStatePath?: string;
}

export interface P63V3LiveEntrypointArgs {
  readonly finalPreLiveToken: P63V3FinalPreLiveGatePassToken;
  readonly paidAuthorization: boolean;
  readonly environment?: NodeJS.ProcessEnv;
  readonly resumePath: string | null;
  readonly adjudicationsPath: string | null;
  /** Offline verifier injection only. Production CLI never supplies this. */
  readonly testDependencies?: P63V3LiveEntrypointTestDependencies;
}

export interface P63V3LiveEntrypointResult {
  readonly statePath: string;
  readonly state: P63V3LiveCalibrationState;
  readonly execution: ReturnType<typeof summarizeP63V3ExecutionState>;
}

/**
 * Provider-capable v3 entrypoint. The production CLI dynamically imports this
 * module only after the exact-checkout final pre-live gate, explicit paid flag,
 * v3 environment authorization, and OPENAI_API_KEY checks have passed.
 */
export async function runP63V3LiveEntrypoint(
  args: P63V3LiveEntrypointArgs
): Promise<P63V3LiveEntrypointResult> {
  assertP63V3FinalPreLiveGatePassToken(args.finalPreLiveToken);
  const receipt = args.finalPreLiveToken.receipt;
  if (receipt.liveAuthorized !== false || receipt.providerCallsMade !== false) {
    throw new Error("P6-3 v3 live entrypoint requires a non-self-authorizing final pre-live receipt");
  }
  const environment = args.environment ?? process.env;
  if (!args.testDependencies?.runStartDependencies && !environment.OPENAI_API_KEY) {
    throw new Error(
      "P6-3 v3 live entrypoint requires OPENAI_API_KEY when no offline executor injection is supplied; no provider calls were made."
    );
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const runtimeInputs = loadP63V3RuntimeInputs(repoRoot);
  const statePath = resolveStatePath(
    repoRoot,
    args.resumePath,
    args.testDependencies?.newStatePath
  );
  const runDir = path.dirname(statePath);
  const resume = args.resumePath !== null;
  fs.mkdirSync(runDir, { recursive: true });

  persistOrVerifyJson(
    path.join(runDir, PRELIVE_RECEIPT_FILE),
    receipt,
    resume,
    "final pre-live receipt"
  );

  const prepared = await prepareP63V3CalibrationRun({
    generationZeroRepositoryFiles: runtimeInputs.repositoryFiles,
    persistence: createPreparationPersistence(runDir, resume),
    runStartDependencies: args.testDependencies?.runStartDependencies,
  });
  if (prepared.plan.length !== 864) {
    throw new Error(`P6-3 v3 live entrypoint requires 864 logical cells, got ${prepared.plan.length}`);
  }
  if (prepared.provenance.fixedEnvironmentIdentity !== prepared.runStart.provenance.fixedEnvironmentIdentity) {
    throw new Error("P6-3 v3 live entrypoint fixed-environment identity mismatch");
  }

  const authorization = authorizeP63V3PaidLiveInvocation({
    invocation: {
      live: true,
      paidAuthorization: args.paidAuthorization,
      checkoutGitSha: receipt.checkoutGitSha,
      environment,
    },
    prepared,
  });

  const controllerPersistence = createControllerPersistence(statePath);
  let state = loadOrCreateState({ statePath, resume, prepared, authorization });

  if (!resume) {
    await controllerPersistence.persistState(state);
  } else if (state.inFlight) {
    recoverInterruptedP63V3State(state);
    await controllerPersistence.persistState(state);
  }

  if (args.adjudicationsPath) {
    const requests = loadAdjudications(args.adjudicationsPath);
    for (const request of requests) {
      applyP63V3Adjudication({ state, prepared, request });
    }
    await controllerPersistence.persistState(state);
  }

  if (state.status !== "running") {
    return {
      statePath,
      state,
      execution: summarizeP63V3ExecutionState(state),
    };
  }

  const executor = createProductionExecutor({ prepared, runtimeInputs });
  state = await executeP63V3ControlledCalibration({
    state,
    prepared,
    authorization,
    executor,
    persistence: controllerPersistence,
  });
  return {
    statePath,
    state,
    execution: summarizeP63V3ExecutionState(state),
  };
}

function createProductionExecutor(args: {
  prepared: Readonly<P63V3PreparedCalibrationRun>;
  runtimeInputs: RuntimeInputs;
}) {
  const { prepared, runtimeInputs } = args;
  const exposureCache = new Map<string, ReturnType<typeof buildP63V3CellExposure>>();
  return {
    execute: async (cell: (typeof prepared.plan)[number]) => {
      const key = `${cell.measurement}:${cell.taskId ?? "bank"}:${cell.armLabel}`;
      let exposure = exposureCache.get(key);
      if (!exposure) {
        exposure = buildP63V3CellExposure({
          cell,
          repositoryFiles: runtimeInputs.repositoryFiles,
          syntheticWorldDir: runtimeInputs.syntheticWorldDir,
          taskById: runtimeInputs.taskById,
          probePrompts: runtimeInputs.probePrompts,
        });
        exposureCache.set(key, exposure);
      }
      if (cell.measurement === "M") {
        const task = runtimeInputs.taskById.get(cell.taskId ?? "");
        if (!task) throw new Error(`P6-3 v3 live M task missing: ${String(cell.taskId)}`);
        return prepared.runStart.executeMCell({
          contextFiles: exposure.contextFiles,
          evaluationRepository: runtimeInputs.repositoryFiles,
          syntheticWorldDir: runtimeInputs.syntheticWorldDir,
          task,
          repeat: cell.repeat,
          contextBudget: cell.budgetTokens,
          exposure: exposure.evidence,
        });
      }
      return prepared.runStart.executeRSemCell({
        contextFiles: exposure.contextFiles,
        probes: runtimeInputs.probes,
        repeat: cell.repeat,
        exposure: exposure.evidence,
      });
    },
  };
}

function loadP63V3RuntimeInputs(repoRoot: string): RuntimeInputs {
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryFiles: Record<string, string> = {};
  loadRepository(
    path.join(syntheticWorldDir, "repository"),
    path.join(syntheticWorldDir, "repository"),
    repositoryFiles
  );

  const rawTasks = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")
  ) as Array<Record<string, unknown>>;
  const rawTaskById = new Map(rawTasks.map((raw) => [String(raw.taskId ?? ""), raw]));
  const taskById = new Map<string, P63V3RuntimeTask>();
  for (const taskId of P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds) {
    const raw = rawTaskById.get(taskId);
    if (!raw) throw new Error(`P6-3 v3 frozen primary task missing: ${taskId}`);
    if (typeof raw.visibleInstruction !== "string") throw new Error(`${taskId}: visibleInstruction missing`);
    if (typeof raw.namingScheme !== "string") throw new Error(`${taskId}: namingScheme missing`);
    if (!raw.groundTruthDelta || typeof raw.groundTruthDelta !== "object") {
      throw new Error(`${taskId}: groundTruthDelta missing`);
    }
    taskById.set(taskId, {
      taskId,
      type: typeof raw.type === "string" ? raw.type : undefined,
      visibleInstruction: raw.visibleInstruction,
      taskSpecificTestCode:
        typeof raw.taskSpecificTestCode === "string" ? raw.taskSpecificTestCode : undefined,
      namingScheme: raw.namingScheme,
      groundTruthDelta: raw.groundTruthDelta as GroundTruthDelta,
    });
  }
  if (taskById.size !== P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskCount) {
    throw new Error("P6-3 v3 frozen primary task bank size mismatch");
  }

  const parity = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "harness", "frozen", "p6-3-rsem-protocol-parity.json"), "utf8")
  ) as any;
  if (parity.status !== "frozen-pass") throw new Error("P6-3 v3 Rsem parity manifest is not frozen-pass");
  const probeIds = parity.probeBank?.booleanProbeIds as string[] | undefined;
  if (!Array.isArray(probeIds) || probeIds.length !== 12) {
    throw new Error("P6-3 v3 frozen Rsem probe ID bank mismatch");
  }
  const allProbes = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "calibration", "fixtures", "probe-bank-stage1.json"), "utf8")
  ) as GeneratedProbe[];
  const probeById = new Map(allProbes.map((probe) => [probe.probeId, probe]));
  const probes = probeIds.map((probeId) => {
    const probe = probeById.get(probeId);
    if (!probe) throw new Error(`P6-3 v3 frozen Rsem probe missing: ${probeId}`);
    if (
      probe.type !== "boolean" ||
      probe.namingScheme !== P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.namingSchemeId
    ) {
      throw new Error(`P6-3 v3 Rsem probe contract drift: ${probeId}`);
    }
    return probe;
  });

  return Object.freeze({
    repositoryFiles: Object.freeze({ ...repositoryFiles }),
    taskById,
    probes: Object.freeze(probes),
    probePrompts: Object.freeze(probes.map((probe) => probe.prompt)),
    syntheticWorldDir,
  });
}

function createPreparationPersistence(runDir: string, resume: boolean) {
  return {
    persistRunFixedEnvironmentProvenance: (
      value: Readonly<P63V3RunFixedEnvironmentProvenance>
    ) => persistOrVerifyJson(
      path.join(runDir, FIXED_ENVIRONMENT_PROVENANCE_FILE),
      value,
      resume,
      "run-fixed environment provenance"
    ),
    persistCalibrationTreatmentProvenance: (
      value: Readonly<P63V3CalibrationTreatmentProvenance>
    ) => persistOrVerifyJson(
      path.join(runDir, TREATMENT_PROVENANCE_FILE),
      value,
      resume,
      "calibration treatment provenance"
    ),
  };
}

function createControllerPersistence(statePath: string): P63V3LiveControllerPersistence {
  const runDir = path.dirname(statePath);
  const attemptsDir = path.join(runDir, "attempts");
  fs.mkdirSync(attemptsDir, { recursive: true });
  return {
    persistState: (state) => writeJsonAtomic(statePath, state),
    persistAttemptArtifact: (cell, attempt, payload) => {
      const target = path.join(
        attemptsDir,
        `${String(cell.sequence).padStart(4, "0")}-${cell.measurement}-${cell.armLabel}-attempt-${attempt}.json`
      );
      if (fs.existsSync(target)) {
        throw new Error(`P6-3 v3 attempt artifact already exists: ${target}`);
      }
      writeJsonAtomic(target, payload);
      return path.relative(runDir, target).split(path.sep).join("/");
    },
  };
}

function loadOrCreateState(args: {
  statePath: string;
  resume: boolean;
  prepared: Readonly<P63V3PreparedCalibrationRun>;
  authorization: P63V3PaidLiveRuntimeAuthorizationToken;
}): P63V3LiveCalibrationState {
  if (!args.resume) {
    if (fs.existsSync(args.statePath)) {
      throw new Error(`P6-3 v3 new-run state already exists: ${args.statePath}`);
    }
    return createP63V3LiveCalibrationState({
      prepared: args.prepared,
      authorization: args.authorization,
    });
  }
  if (!fs.existsSync(args.statePath) || !fs.statSync(args.statePath).isFile()) {
    throw new Error(`P6-3 v3 --resume state file does not exist: ${args.statePath}`);
  }
  const state = JSON.parse(fs.readFileSync(args.statePath, "utf8")) as P63V3LiveCalibrationState;
  assertP63V3ResumeCompatible({
    state,
    prepared: args.prepared,
    authorization: args.authorization,
  });
  return state;
}

function resolveStatePath(
  repoRoot: string,
  resumePath: string | null,
  newStatePath?: string
): string {
  if (resumePath) return path.resolve(resumePath);
  if (newStatePath) return path.resolve(newStatePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", `p6-3-v3-live-${stamp}`, "state.json");
}

function loadAdjudications(filePath: string): P63V3AdjudicationRequest[] {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("P6-3 v3 --adjudications must contain a non-empty JSON array");
  }
  return parsed as P63V3AdjudicationRequest[];
}

function persistOrVerifyJson(
  target: string,
  expected: unknown,
  resume: boolean,
  label: string
): void {
  if (!resume) {
    if (fs.existsSync(target)) throw new Error(`P6-3 v3 new-run ${label} already exists: ${target}`);
    writeJsonAtomic(target, expected);
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`P6-3 v3 resume ${label} missing: ${target}`);
  }
  const actual = JSON.parse(fs.readFileSync(target, "utf8")) as unknown;
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`P6-3 v3 resume ${label} mismatch: ${target}`);
  }
}

function writeJsonAtomic(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

function loadRepository(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadRepository(full, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}
