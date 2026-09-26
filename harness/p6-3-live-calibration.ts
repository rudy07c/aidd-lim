import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { GroundTruthDelta } from "../synthetic-world/schema";
import {
  assembleELTaskStaticExposure,
  type ELTaskDescriptor,
} from "./src/context/el-static-exposure-runtime";
import { assembleELRSemBankStaticExposure } from "./src/context/el-rsem-static-exposure-runtime";
import {
  countStaticRepositoryPayloadTokens,
  serializeStaticRepositoryPayload,
} from "./src/context/static-exposure";
import type { RunConfig } from "./src/types";
import {
  loadDirRecursive,
  loadProbeMaterial,
  type HeldOutTask,
} from "./p6-af-baseline-live";
import {
  applyP63Adjudication,
  assertP63ResumeCompatible,
  buildP63CalibrationPlan,
  createP63CalibrationState,
  executeP63Calibration,
  recoverInterruptedP63State,
  summarizeP63ExecutionState,
  type P63AdjudicationRequest,
  type P63CalibrationCell,
  type P63CalibrationPersistence,
  type P63CalibrationState,
  type P63ExposureEvidence,
  type P63FrozenBudgets,
} from "./src/p6/p6-3-live-calibration-runner";
import {
  executeP63MCell,
  executeP63RSemCell,
  type P63MutationTask,
} from "./src/p6/p6-3-live-executors";
import { P6_3_MUTATION_PROVIDER_CONTRACT } from "./src/p6/p6-3-mutation-protocol-parity";
import { runP63UnifiedPreLiveGate } from "./src/p6/p6-3-unified-prelive-gate";

interface P63Task extends HeldOutTask, ELTaskDescriptor {
  namingScheme: string;
  groundTruthDelta: GroundTruthDelta;
}

interface P63StructuralFreezeRuntime {
  budgets: P63FrozenBudgets;
  tEl: number;
  staticExposureMaxTokensPerUnit: number;
  primaryMTaskIds: string[];
  rsemNamingSchemeId: string;
  repositoryPayloadSha256: string;
}

function mainArgs(argv: string[]): {
  live: boolean;
  paidAuthorization: boolean;
  resumePath: string | null;
  adjudicationsPath: string | null;
} {
  const live = argv.includes("--live");
  const paidAuthorization = argv.includes("--authorize-paid-live=P6-3");
  const valueAfter = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    if (index < 0) return null;
    const value = argv[index + 1];
    if (!value) throw new Error(`${flag} requires a path`);
    return path.resolve(process.cwd(), value);
  };
  return {
    live,
    paidAuthorization,
    resumePath: valueAfter("--resume"),
    adjudicationsPath: valueAfter("--adjudications"),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = mainArgs(argv);
  const repoRoot = path.resolve(__dirname, "..");
  const harnessRoot = __dirname;
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");

  // Single fail-closed prerequisite. This re-verifies all four frozen P6-3
  // surfaces against the exact clean checkout and never self-authorizes live use.
  const preLiveToken = runP63UnifiedPreLiveGate(harnessRoot);
  const structural = loadStructuralFreeze(harnessRoot);
  const plan = buildP63CalibrationPlan(structural.budgets, structural.primaryMTaskIds);

  const repository: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repository);
  const fullRepositoryTokens = countStaticRepositoryPayloadTokens(repository);
  const repositoryPayloadSha256 = sha256(serializeStaticRepositoryPayload(repository));
  if (fullRepositoryTokens !== structural.tEl) {
    throw new Error(
      `P6-3 full repository token count drifted: expected T_EL=${structural.tEl}, got ${fullRepositoryTokens}`
    );
  }
  if (repositoryPayloadSha256 !== structural.repositoryPayloadSha256) {
    throw new Error("P6-3 full repository static payload hash drifted from structural freeze");
  }

  const tasks = loadTasks(path.join(syntheticWorldDir, "heldout_tasks.json"));
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  for (const taskId of structural.primaryMTaskIds) {
    if (!taskById.has(taskId)) throw new Error(`P6-3 primary task missing: ${taskId}`);
  }
  const probeMaterial = loadProbeMaterial(syntheticWorldDir);
  if (probeMaterial.booleanProbes.length !== 12) {
    throw new Error(`P6-3 requires frozen 12-probe Rsem bank, got ${probeMaterial.booleanProbes.length}`);
  }

  console.log("P6-3 PRELIVE", JSON.stringify({
    checkoutGitSha: preLiveToken.receipt.checkoutGitSha,
    preflightPassed: preLiveToken.receipt.preflightPassed,
    liveAuthorized: preLiveToken.receipt.liveAuthorized,
    manifestHashes: Object.fromEntries(
      Object.entries(preLiveToken.receipt.manifests).map(([key, value]) => [key, value.sha256])
    ),
  }));
  console.log("P6-3 PLAN", JSON.stringify({
    logicalCells: plan.length,
    M: plan.filter((cell) => cell.measurement === "M").length,
    Rsem: plan.filter((cell) => cell.measurement === "Rsem").length,
    repeats: 12,
    arms: ["B0", "B1", "B2", "B3", "B4", "AF"],
    T_EL: structural.tEl,
    budgets: structural.budgets,
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
  }));

  if (!args.live) {
    console.log(
      "STOP: P6-3 dry/offline mode. Unified pre-live gate and frozen 864-cell plan verified; no provider/API call was requested."
    );
    return;
  }

  assertExplicitPaidLiveAuthorization(args.paidAuthorization);
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for P6-3 paid/live execution");
  }

  const statePath = args.resumePath ?? createStatePath(repoRoot);
  const runDir = path.dirname(statePath);
  const persistence = createPersistence(runDir, statePath);
  let state: P63CalibrationState;

  if (args.resumePath) {
    state = JSON.parse(fs.readFileSync(args.resumePath, "utf8")) as P63CalibrationState;
    assertP63ResumeCompatible(state, preLiveToken, plan);
    if (state.inFlight) {
      recoverInterruptedP63State(state);
      await persistence.persistState(state);
      console.log("STOP: resume found an uncertain in-flight attempt; state moved to needs-audit without repeating the provider call.");
      console.log("RESULT", statePath);
      return;
    }
  } else {
    state = createP63CalibrationState(preLiveToken, plan);
    await persistence.persistState(state);
    console.log("RESULT", statePath);
  }

  if (args.adjudicationsPath) {
    const requests = JSON.parse(
      fs.readFileSync(args.adjudicationsPath, "utf8")
    ) as P63AdjudicationRequest[];
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error("--adjudications must contain a non-empty JSON array");
    }
    for (const request of requests) applyP63Adjudication(state, plan, request);
    await persistence.persistState(state);
  }

  if (state.status === "needs-audit") {
    console.log("STOP: P6-3 state is needs-audit; supply an explicit adjudication before continuation.");
    console.log("P6-3 STATE", JSON.stringify(summarizeP63ExecutionState(state)));
    console.log("RESULT", statePath);
    return;
  }
  if (state.status === "completed") {
    console.log("P6-3 calibration is already completed.");
    console.log("P6-3 STATE", JSON.stringify(summarizeP63ExecutionState(state)));
    console.log("RESULT", statePath);
    return;
  }

  const executor = {
    execute: async (cell: P63CalibrationCell) => {
      const exposure = buildExposure({
        cell,
        structural,
        repository,
        syntheticWorldDir,
        taskById,
        probePrompts: probeMaterial.booleanProbes.map((probe) => probe.prompt),
      });
      if (cell.measurement === "M") {
        const task = taskById.get(cell.taskId ?? "");
        if (!task) throw new Error(`P6-3 M task not found: ${String(cell.taskId)}`);
        return executeP63MCell({
          contextFiles: exposure.contextFiles,
          evaluationRepository: repository,
          syntheticWorldDir,
          task: task as P63MutationTask,
          repeat: cell.repeat,
          contextBudget: cell.budgetTokens,
          exposure: exposure.evidence,
        });
      }
      return executeP63RSemCell({
        contextFiles: exposure.contextFiles,
        probes: probeMaterial.booleanProbes,
        repeat: cell.repeat,
        exposure: exposure.evidence,
      });
    },
  };

  state = await executeP63Calibration(
    state,
    preLiveToken,
    plan,
    executor,
    persistence
  );
  console.log("P6-3 STATE", JSON.stringify(summarizeP63ExecutionState(state)));
  console.log("RESULT", statePath);
  if (state.status === "needs-audit") {
    console.log(
      "STOP: P6-3 paused before the next arm. No scientific replacement occurs until explicit adjudication is supplied."
    );
  } else if (state.status === "completed") {
    console.log(
      "STOP: P6-3 live calibration calls completed. Results remain calibration-only and are not Stage 1A confirmatory evidence."
    );
  }
}

function buildExposure(args: {
  cell: P63CalibrationCell;
  structural: P63StructuralFreezeRuntime;
  repository: Record<string, string>;
  syntheticWorldDir: string;
  taskById: Map<string, P63Task>;
  probePrompts: string[];
}): { contextFiles: Record<string, string>; evidence: P63ExposureEvidence } {
  const { cell, structural, repository } = args;
  if (cell.arm.kind === "AF") {
    const payload = serializeStaticRepositoryPayload(repository);
    const actual = countStaticRepositoryPayloadTokens(repository);
    if (actual !== structural.tEl) throw new Error("P6-3 AF runtime token count drifted from T_EL");
    const hash = sha256(payload);
    if (hash !== structural.repositoryPayloadSha256) {
      throw new Error("P6-3 AF runtime payload hash drifted from structural freeze");
    }
    return {
      contextFiles: { ...repository },
      evidence: {
        mode: "AF-full",
        budgetTokens: "full",
        actualExposedTokens: actual,
        fullRepositoryTokens: actual,
        staticPayloadHash: hash,
        exposureSetHash: null,
        selectorPlanHash: null,
        selectedUnitCount: null,
      },
    };
  }

  const config = buildELRunConfig(
    args.syntheticWorldDir,
    cell.budgetTokens,
    structural.staticExposureMaxTokensPerUnit,
    cell.measurement,
    cell.taskId
  );
  const assembled = cell.measurement === "M"
    ? (() => {
        const task = args.taskById.get(cell.taskId ?? "");
        if (!task) throw new Error(`P6-3 EL task not found: ${String(cell.taskId)}`);
        return assembleELTaskStaticExposure({
          config,
          task,
          repositoryFiles: repository,
        });
      })()
    : assembleELRSemBankStaticExposure({
        config,
        probePrompts: args.probePrompts,
        namingSchemeId: structural.rsemNamingSchemeId,
        repositoryFiles: repository,
      });

  if (assembled.log.fullRepositoryTokens !== structural.tEl) {
    throw new Error("P6-3 EL exposure fullRepositoryTokens drifted from T_EL");
  }
  if (assembled.log.maxTokensPerUnit !== structural.staticExposureMaxTokensPerUnit) {
    throw new Error("P6-3 EL exposure chunk granularity drifted from structural freeze");
  }
  if (assembled.log.budgetTokens !== cell.budgetTokens) {
    throw new Error("P6-3 EL exposure budget drifted from logical cell");
  }
  if (assembled.log.actualExposedTokens > assembled.log.budgetTokens) {
    throw new Error("P6-3 EL actual exposure exceeded B_expose");
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

function buildELRunConfig(
  syntheticWorldDir: string,
  contextBudget: number | "full",
  maxTokensPerUnit: number,
  measurement: "M" | "Rsem",
  taskId: string | null
): RunConfig {
  if (contextBudget === "full") {
    throw new Error("P6-3 EL run config cannot use full context budget");
  }
  return {
    experimentId: "p6-3-el-calibration",
    lineageId: `p6-3-${measurement.toLowerCase()}-${taskId ?? "bank-12"}`,
    runClass: "scientific-calibration",
    backend: "openai",
    condition: "EL",
    contextBudget,
    staticExposureMaxTokensPerUnit: maxTokensPerUnit,
    generations: 1,
    tasks: taskId ? [taskId] : ["Rsem-bank-12"],
    model: P6_3_MUTATION_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_MUTATION_PROVIDER_CONTRACT.reasoningEffort,
    maxOutputTokens: P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
    requestTimeoutMs: P6_3_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs,
    maxRetries: P6_3_MUTATION_PROVIDER_CONTRACT.providerMaxRetries,
    storeResponses: P6_3_MUTATION_PROVIDER_CONTRACT.storeResponses,
    maxToolRounds: P6_3_MUTATION_PROVIDER_CONTRACT.maxToolRounds,
    serviceTier: P6_3_MUTATION_PROVIDER_CONTRACT.serviceTier,
    promptCacheMode: P6_3_MUTATION_PROVIDER_CONTRACT.promptCacheMode,
    stage: "P6-3-calibration-only",
    syntheticWorldDir,
    runsDir: path.resolve(syntheticWorldDir, "../runs"),
  };
}

function loadStructuralFreeze(harnessRoot: string): P63StructuralFreezeRuntime {
  const manifestPath = path.join(harnessRoot, "frozen/p6-3-el-structural-freeze.json");
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as any;
  if (parsed.status !== "frozen-pass") {
    throw new Error("P6-3 structural freeze manifest is not frozen-pass");
  }
  const freeze = parsed.freezeCandidate;
  if (!freeze || typeof freeze !== "object") throw new Error("P6-3 structural freeze candidate missing");
  const budgets = freeze.budgets as P63FrozenBudgets;
  const result: P63StructuralFreezeRuntime = {
    budgets,
    tEl: freeze.T_EL,
    staticExposureMaxTokensPerUnit: freeze.staticExposureMaxTokensPerUnit,
    primaryMTaskIds: [...freeze.primaryMTaskIds],
    rsemNamingSchemeId: freeze.rsem.namingSchemeId,
    repositoryPayloadSha256: parsed.fingerprints.repositoryPayloadSha256,
  };
  if (result.tEl !== result.budgets.AF) {
    throw new Error("P6-3 structural freeze requires AF budget to equal T_EL");
  }
  return result;
}

function loadTasks(taskBankPath: string): P63Task[] {
  const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as P63Task[];
  for (const task of tasks) {
    if (!task.taskId || !task.visibleInstruction) throw new Error("Malformed P6-3 heldout task");
  }
  return tasks;
}

function createPersistence(
  runDir: string,
  statePath: string
): P63CalibrationPersistence {
  return {
    persistState: (state) => {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const tmp = `${statePath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
      fs.renameSync(tmp, statePath);
    },
    persistAttemptArtifact: (cell, attempt, payload) => {
      const targetDir = path.join(
        runDir,
        "attempts",
        `cell-${String(cell.sequence).padStart(4, "0")}-${cell.measurement.toLowerCase()}-${safe(cell.taskId ?? "bank-12")}-${cell.arm.label}`
      );
      fs.mkdirSync(targetDir, { recursive: true });
      const target = path.join(targetDir, `attempt-${attempt}.json`);
      if (fs.existsSync(target)) {
        throw new Error(`P6-3 attempt artifact already exists: ${target}`);
      }
      const tmp = `${target}.tmp-${process.pid}`;
      fs.writeFileSync(
        tmp,
        JSON.stringify({ cell, attempt, payload }, null, 2) + "\n",
        "utf8"
      );
      fs.renameSync(tmp, target);
      return path.relative(runDir, target).replace(/\\/g, "/");
    },
  };
}

function createStatePath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    repoRoot,
    "runs",
    "_calibration",
    `p6-3-el-calibration-luna__${stamp}`,
    "result.json"
  );
}

function assertExplicitPaidLiveAuthorization(cliAuthorized: boolean): void {
  if (!cliAuthorized || process.env.P6_3_LIVE_EXECUTION_ALLOWED !== "1") {
    throw new Error(
      "P6-3 paid/live execution refused: require both --authorize-paid-live=P6-3 and P6_3_LIVE_EXECUTION_ALLOWED=1"
    );
  }
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("p6-3-live-calibration failed:", error);
    process.exit(1);
  });
}
