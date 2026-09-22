import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import { STAGE1_BOOLEAN_DESIGN_VERSION } from "../calibration/src/stage1-probes";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../synthetic-world/schema";
import {
  buildElTaskStaticExposure,
  countStaticRepositoryPayloadTokens,
  type ElStaticExposureResult,
} from "./src/context/el-static-exposure";
import {
  buildElRsemBankPlan,
  buildElRsemBankStaticExposure,
  sanitizeElRsemSelectorProbes,
} from "./src/context/el-rsem-bank-selector";
import {
  P6_3_MAX_TOKENS_PER_UNIT_CANDIDATES,
  buildP63BudgetGrid,
  assertP63Counterbalance,
} from "./src/p6/el-calibration-design";
import { P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

interface PlanProfile {
  planId: string;
  actualTokens: number[];
  exposureHashes: string[];
  selectedUnitCounts: number[];
}

interface CandidateResult {
  maxTokensPerUnit: number;
  ok: boolean;
  failure: string | null;
  profiles: PlanProfile[];
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repository = loadRepository(path.join(syntheticWorldDir, "repository"));
  const groundTruth = loadJson<GroundTruth>(path.join(syntheticWorldDir, "ground_truth.json"));
  const namingSchemes = loadJson<NamingScheme[]>(path.join(syntheticWorldDir, "naming_schemes.json"));
  const tasks = loadJson<HeldOutTask[]>(path.join(syntheticWorldDir, "heldout_tasks.json"));
  const probes = loadJson<GeneratedProbe[]>(
    path.join(repoRoot, "calibration", "fixtures", "probe-bank-stage1.json")
  );

  const fullPayloadTokens = countStaticRepositoryPayloadTokens(repository);
  const budgetGrid = buildP63BudgetGrid(fullPayloadTokens);
  assertP63Counterbalance();

  const primaryTasks = P6_2_PRIMARY_TASK_IDS.map((taskId) => {
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) throw new Error(`P6-3 primary task missing from heldout bank: ${taskId}`);
    if (!task.groundTruthDelta || !task.namingScheme) {
      throw new Error(`P6-3 primary task missing EL selector inputs: ${taskId}`);
    }
    const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === task.namingScheme);
    if (!namingScheme) throw new Error(`Naming scheme not found for ${taskId}: ${task.namingScheme}`);
    return { task, namingScheme };
  });

  const booleanProbes = probes.filter((probe) =>
    probe.type === "boolean" &&
    (probe.derivedFrom as Record<string, unknown>).designVersion === STAGE1_BOOLEAN_DESIGN_VERSION
  );
  assert.strictEqual(booleanProbes.length, 12, "P6-3 requires the frozen 12-probe Rsem bank");
  const sanitizedRsemProbes = sanitizeElRsemSelectorProbes(booleanProbes);
  const rsemSchemeIds = new Set(sanitizedRsemProbes.map((probe) => probe.namingScheme));
  assert.strictEqual(rsemSchemeIds.size, 1, "P6-3 Rsem bank must use one naming scheme");
  const rsemSchemeId = [...rsemSchemeIds][0];
  const rsemNamingScheme = namingSchemes.find((candidate) => candidate.schemeId === rsemSchemeId);
  if (!rsemNamingScheme) throw new Error(`Rsem naming scheme not found: ${rsemSchemeId}`);
  const rsemPlan = buildElRsemBankPlan({
    repositoryFiles: repository,
    groundTruth,
    namingScheme: rsemNamingScheme,
    probes: sanitizedRsemProbes,
  });

  const candidateResults: CandidateResult[] = [];
  for (const maxTokensPerUnit of P6_3_MAX_TOKENS_PER_UNIT_CANDIDATES) {
    try {
      const profiles: PlanProfile[] = [];
      for (const { task, namingScheme } of primaryTasks) {
        const exposures = budgetGrid.finite.map((budget) =>
          buildElTaskStaticExposure({
            repositoryFiles: repository,
            groundTruth,
            delta: task.groundTruthDelta!,
            namingScheme,
            budgetTokens: budget.nominalTokens,
            maxTokensPerUnit,
          })
        );
        const full = buildElTaskStaticExposure({
          repositoryFiles: repository,
          groundTruth,
          delta: task.groundTruthDelta!,
          namingScheme,
          budgetTokens: fullPayloadTokens,
          maxTokensPerUnit,
        });
        profiles.push(assertDoseStructure(task.taskId, exposures, full, repository, fullPayloadTokens));
      }

      const rsemExposures = budgetGrid.finite.map((budget) =>
        buildElRsemBankStaticExposure({
          repositoryFiles: repository,
          plan: rsemPlan,
          budgetTokens: budget.nominalTokens,
          maxTokensPerUnit,
        })
      );
      const rsemFull = buildElRsemBankStaticExposure({
        repositoryFiles: repository,
        plan: rsemPlan,
        budgetTokens: fullPayloadTokens,
        maxTokensPerUnit,
      });
      profiles.push(
        assertDoseStructure("Rsem-bank", rsemExposures, rsemFull, repository, fullPayloadTokens)
      );

      candidateResults.push({ maxTokensPerUnit, ok: true, failure: null, profiles });
    } catch (error) {
      candidateResults.push({
        maxTokensPerUnit,
        ok: false,
        failure: error instanceof Error ? error.message : String(error),
        profiles: [],
      });
    }
  }

  const selected = candidateResults.find((candidate) => candidate.ok) ?? null;
  if (!selected) {
    console.log(JSON.stringify({
      status: "needs-design-audit",
      fullPayloadTokens,
      budgetGrid,
      rsemPlan,
      candidateResults,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify({
    status: "structural-candidate-selected",
    selectionRule: "largest-predeclared-maxTokensPerUnit-satisfying-all-primary-M-and-Rsem-structural-gates",
    fullPayloadTokens,
    budgetGrid,
    selectedMaxTokensPerUnit: selected.maxTokensPerUnit,
    primaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
    rsem: {
      selectorVersion: rsemPlan.selectorVersion,
      rankingPolicyVersion: rsemPlan.rankingPolicyVersion,
      planInputSha256: rsemPlan.planInputSha256,
      probeIds: rsemPlan.probeIds,
      unionEntities: rsemPlan.unionEntities,
      rankedPaths: rsemPlan.rankedPaths,
    },
    selectedProfiles: selected.profiles,
    candidateResults: candidateResults.map((candidate) => ({
      maxTokensPerUnit: candidate.maxTokensPerUnit,
      ok: candidate.ok,
      failure: candidate.failure,
    })),
  }, null, 2));
}

function assertDoseStructure(
  planId: string,
  finite: ElStaticExposureResult[],
  full: ElStaticExposureResult,
  repository: Record<string, string>,
  fullPayloadTokens: number
): PlanProfile {
  assert.strictEqual(finite.length, 5);
  assert.strictEqual(finite[0].log.nominalBudgetTokens, 0);
  assert.strictEqual(finite[0].log.actualPayloadTokens, 0, `${planId}: B0 must expose zero artifact tokens`);
  assert.strictEqual(finite[0].log.selectedUnitIds.length, 0, `${planId}: B0 must expose zero units`);

  const actualTokens = finite.map((entry) => entry.log.actualPayloadTokens);
  for (let index = 1; index < finite.length; index++) {
    assert(
      actualTokens[index] > actualTokens[index - 1],
      `${planId}: actual tokens must strictly increase; got ${actualTokens.join(",")}`
    );
    assert(
      actualTokens[index] < fullPayloadTokens,
      `${planId}: finite budget ${index} reached full exposure unexpectedly`
    );
    assert.deepStrictEqual(
      finite[index].log.selectedUnitIds.slice(0, finite[index - 1].log.selectedUnitIds.length),
      finite[index - 1].log.selectedUnitIds,
      `${planId}: exposure sets are not nested prefixes at finite level ${index}`
    );
  }

  const nonzeroHashes = finite.slice(1).map((entry) => entry.log.exposureSha256);
  assert.strictEqual(
    new Set(nonzeroHashes).size,
    nonzeroHashes.length,
    `${planId}: B1..B4 exposure hashes are not all distinct`
  );
  assert.deepStrictEqual(full.contextFiles, repository, `${planId}: full exposure must reconstruct AF repository`);
  assert.strictEqual(full.log.actualPayloadTokens, fullPayloadTokens, `${planId}: full token parity failed`);
  assert.deepStrictEqual(
    full.log.selectedUnitIds.slice(0, finite[finite.length - 1].log.selectedUnitIds.length),
    finite[finite.length - 1].log.selectedUnitIds,
    `${planId}: B4 is not a prefix of full exposure`
  );

  return {
    planId,
    actualTokens,
    exposureHashes: finite.map((entry) => entry.log.exposureSha256),
    selectedUnitCounts: finite.map((entry) => entry.log.selectedUnitIds.length),
  };
}

function loadRepository(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (absoluteDir: string, relativeDir: string) => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const abs = path.join(absoluteDir, entry.name);
      const rel = path.posix.join(relativeDir, entry.name);
      if (entry.isDirectory()) visit(abs, rel);
      else if (entry.isFile()) result[rel] = fs.readFileSync(abs, "utf8");
    }
  };
  visit(root, "");
  return result;
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

main();
