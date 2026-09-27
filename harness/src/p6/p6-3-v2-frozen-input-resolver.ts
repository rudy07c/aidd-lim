import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  assembleELTaskStaticExposure,
  type ELTaskDescriptor,
} from "../context/el-static-exposure-runtime";
import { assembleELRSemBankStaticExposure } from "../context/el-rsem-static-exposure-runtime";
import {
  countStaticRepositoryPayloadTokens,
  serializeStaticRepositoryPayload,
} from "../context/static-exposure";
import type { RunConfig } from "../types";
import {
  loadDirRecursive,
  loadProbeMaterial,
  type HeldOutTask,
} from "../../p6-af-baseline-live";
import type {
  P63CalibrationCell,
  P63ExposureEvidence,
  P63FrozenBudgets,
} from "./p6-3-live-calibration-runner";
import {
  P6_3_V2_MUTATION_PROVIDER_CONTRACT,
} from "./p6-3-v2-execution-parameters";
import type {
  P63V2CellInputResolver,
  P63V2MCellInputs,
  P63V2RSemCellInputs,
} from "./p6-3-v2-end-to-end";

interface P63FrozenTask extends HeldOutTask, ELTaskDescriptor {}

export interface P63V2FrozenStructuralRuntime {
  readonly budgets: P63FrozenBudgets;
  readonly tEl: number;
  readonly staticExposureMaxTokensPerUnit: number;
  readonly primaryMTaskIds: readonly string[];
  readonly rsemNamingSchemeId: string;
  readonly rsemBooleanProbeCount: number;
  readonly repositoryPayloadSha256: string;
}

export interface P63V2FrozenRuntimeInputs {
  readonly resolver: P63V2CellInputResolver;
  readonly structural: P63V2FrozenStructuralRuntime;
  readonly repository: Readonly<Record<string, string>>;
  readonly taskById: ReadonlyMap<string, P63FrozenTask>;
  readonly probes: ReturnType<typeof loadProbeMaterial>["booleanProbes"];
  readonly syntheticWorldDir: string;
}

export function loadP63V2FrozenRuntimeInputs(args: {
  repoRoot?: string;
} = {}): P63V2FrozenRuntimeInputs {
  const repoRoot = path.resolve(args.repoRoot ?? path.resolve(__dirname, "../../.."));
  const harnessRoot = path.join(repoRoot, "harness");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");
  const structural = loadStructuralFreeze(harnessRoot);

  const repository: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repository);
  assertRepositoryMatchesFreeze(repository, structural);

  const tasks = loadTasks(path.join(syntheticWorldDir, "heldout_tasks.json"));
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  for (const taskId of structural.primaryMTaskIds) {
    if (!taskById.has(taskId)) {
      throw new Error(`P6-3 v2 frozen primary task missing: ${taskId}`);
    }
  }

  const probeMaterial = loadProbeMaterial(syntheticWorldDir);
  if (probeMaterial.booleanProbes.length !== structural.rsemBooleanProbeCount) {
    throw new Error(
      `P6-3 v2 frozen Rsem bank size drifted: expected=${structural.rsemBooleanProbeCount} actual=${probeMaterial.booleanProbes.length}`
    );
  }
  const probePrompts = probeMaterial.booleanProbes.map((probe) => probe.prompt);

  const resolver: P63V2CellInputResolver = {
    resolveM: (cell): P63V2MCellInputs => {
      if (cell.measurement !== "M" || cell.taskId === null) {
        throw new Error("P6-3 v2 frozen M resolver received a non-M logical cell");
      }
      const task = taskById.get(cell.taskId);
      if (!task) throw new Error(`P6-3 v2 frozen M task not found: ${cell.taskId}`);
      const exposure = buildExposure({
        cell,
        structural,
        repository,
        syntheticWorldDir,
        task,
        probePrompts,
      });
      return {
        contextFiles: exposure.contextFiles,
        evaluationRepository: repository,
        syntheticWorldDir,
        task,
        exposure: exposure.evidence,
      };
    },
    resolveRSem: (cell): P63V2RSemCellInputs => {
      if (cell.measurement !== "Rsem" || cell.taskId !== null) {
        throw new Error("P6-3 v2 frozen Rsem resolver received a non-Rsem logical cell");
      }
      const exposure = buildExposure({
        cell,
        structural,
        repository,
        syntheticWorldDir,
        task: null,
        probePrompts,
      });
      return {
        contextFiles: exposure.contextFiles,
        probes: probeMaterial.booleanProbes,
        exposure: exposure.evidence,
      };
    },
  };

  return {
    resolver,
    structural,
    repository: Object.freeze({ ...repository }),
    taskById,
    probes: probeMaterial.booleanProbes,
    syntheticWorldDir,
  };
}

function buildExposure(args: {
  cell: P63CalibrationCell;
  structural: P63V2FrozenStructuralRuntime;
  repository: Record<string, string>;
  syntheticWorldDir: string;
  task: P63FrozenTask | null;
  probePrompts: readonly string[];
}): { contextFiles: Record<string, string>; evidence: P63ExposureEvidence } {
  const { cell, structural, repository } = args;
  if (cell.arm.kind === "AF") {
    const payload = serializeStaticRepositoryPayload(repository);
    const actual = countStaticRepositoryPayloadTokens(repository);
    const hash = sha256(payload);
    if (actual !== structural.tEl || hash !== structural.repositoryPayloadSha256) {
      throw new Error("P6-3 v2 AF runtime repository drifted from structural freeze");
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
        if (!args.task) throw new Error("P6-3 v2 EL M task missing");
        return assembleELTaskStaticExposure({
          config,
          task: args.task,
          repositoryFiles: repository,
        });
      })()
    : assembleELRSemBankStaticExposure({
        config,
        probePrompts: [...args.probePrompts],
        namingSchemeId: structural.rsemNamingSchemeId,
        repositoryFiles: repository,
      });

  if (assembled.log.fullRepositoryTokens !== structural.tEl) {
    throw new Error("P6-3 v2 EL exposure fullRepositoryTokens drifted from T_EL");
  }
  if (assembled.log.maxTokensPerUnit !== structural.staticExposureMaxTokensPerUnit) {
    throw new Error("P6-3 v2 EL exposure chunk granularity drifted from structural freeze");
  }
  if (assembled.log.budgetTokens !== cell.budgetTokens) {
    throw new Error("P6-3 v2 EL exposure budget drifted from logical cell");
  }
  if (assembled.log.actualExposedTokens > assembled.log.budgetTokens) {
    throw new Error("P6-3 v2 EL actual exposure exceeded B_expose");
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
    throw new Error("P6-3 v2 EL run config cannot use full context budget");
  }
  return {
    experimentId: "p6-3-el-calibration-v2",
    lineageId: `p6-3-v2-${measurement.toLowerCase()}-${taskId ?? "bank-12"}`,
    runClass: "scientific-calibration",
    backend: "openai",
    condition: "EL",
    contextBudget,
    staticExposureMaxTokensPerUnit: maxTokensPerUnit,
    generations: 1,
    tasks: taskId ? [taskId] : ["Rsem-bank-12"],
    model: P6_3_V2_MUTATION_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_V2_MUTATION_PROVIDER_CONTRACT.reasoningEffort,
    maxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
    requestTimeoutMs: P6_3_V2_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs,
    maxRetries: P6_3_V2_MUTATION_PROVIDER_CONTRACT.providerMaxRetries,
    storeResponses: P6_3_V2_MUTATION_PROVIDER_CONTRACT.storeResponses,
    maxToolRounds: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxToolRounds,
    serviceTier: P6_3_V2_MUTATION_PROVIDER_CONTRACT.serviceTier,
    promptCacheMode: P6_3_V2_MUTATION_PROVIDER_CONTRACT.promptCacheMode,
    stage: "P6-3-v2-calibration-only",
    syntheticWorldDir,
    runsDir: path.resolve(syntheticWorldDir, "../runs"),
  };
}

function loadStructuralFreeze(harnessRoot: string): P63V2FrozenStructuralRuntime {
  const manifestPath = path.join(harnessRoot, "frozen/p6-3-el-structural-freeze.json");
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as any;
  if (parsed.status !== "frozen-pass") {
    throw new Error("P6-3 v2 structural freeze manifest is not frozen-pass");
  }
  const freeze = parsed.freezeCandidate;
  if (!freeze || typeof freeze !== "object") {
    throw new Error("P6-3 v2 structural freeze candidate missing");
  }
  const budgets = freeze.budgets as P63FrozenBudgets;
  const result: P63V2FrozenStructuralRuntime = {
    budgets,
    tEl: freeze.T_EL,
    staticExposureMaxTokensPerUnit: freeze.staticExposureMaxTokensPerUnit,
    primaryMTaskIds: [...freeze.primaryMTaskIds],
    rsemNamingSchemeId: freeze.rsem.namingSchemeId,
    rsemBooleanProbeCount: freeze.rsem.booleanProbeCount,
    repositoryPayloadSha256: parsed.fingerprints.repositoryPayloadSha256,
  };
  if (result.tEl !== result.budgets.AF) {
    throw new Error("P6-3 v2 structural freeze requires AF budget to equal T_EL");
  }
  return result;
}

function loadTasks(taskBankPath: string): P63FrozenTask[] {
  const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as P63FrozenTask[];
  for (const task of tasks) {
    if (!task.taskId || !task.visibleInstruction) {
      throw new Error("Malformed P6-3 v2 heldout task");
    }
  }
  return tasks;
}

function assertRepositoryMatchesFreeze(
  repository: Record<string, string>,
  structural: P63V2FrozenStructuralRuntime
): void {
  const tokens = countStaticRepositoryPayloadTokens(repository);
  const payloadHash = sha256(serializeStaticRepositoryPayload(repository));
  if (tokens !== structural.tEl) {
    throw new Error(`P6-3 v2 repository token count drifted: expected=${structural.tEl} actual=${tokens}`);
  }
  if (payloadHash !== structural.repositoryPayloadSha256) {
    throw new Error("P6-3 v2 repository static payload hash drifted from structural freeze");
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
