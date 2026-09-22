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
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_EL_CALIBRATION_DESIGN_VERSION,
  P6_3_FROZEN_FINITE_BUDGET_TOKENS,
  P6_3_FROZEN_FULL_PAYLOAD_TOKENS,
  P6_3_FROZEN_MAX_TOKENS_PER_UNIT,
  P6_3_FROZEN_RSEM_PLAN_INPUT_SHA256,
  P6_3_MAX_ATTEMPTS_PER_LOGICAL_CELL,
  P6_3_STRUCTURAL_PREFLIGHT_VERSION,
  assertP63Counterbalance,
  assertP63StructuralFreeze,
  buildP63BudgetGrid,
  selectP63ExposureBudget,
} from "./src/p6/el-calibration-design";
import { P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

interface EvidenceProfile {
  actualTokens: number[];
  selectedUnitCounts: number[];
}

interface StructuralEvidence {
  schemaVersion: string;
  status: string;
  selectionRule: string;
  fullPayloadTokens: number;
  budgetGrid: Record<string, number | string>;
  maxTokensPerUnitCandidates: number[];
  candidateResults: Array<{ maxTokensPerUnit: number; ok: boolean }>;
  selectedMaxTokensPerUnit: number;
  primaryTaskIds: string[];
  rsem: {
    selectorVersion: string;
    rankingPolicyVersion: string;
    planInputSha256: string;
    probeIds: string[];
    unionEntities: string[];
  };
  selectedProfiles: Record<string, EvidenceProfile>;
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
  const evidence = loadJson<StructuralEvidence>(
    path.join(repoRoot, "docs", "findings", "evidence", "p6-3-el-structural-preflight", "result.json")
  );

  assert.strictEqual(P6_3_EL_CALIBRATION_DESIGN_VERSION, "p6-3-el-calibration-v1-static-prefix-six-level");
  assert.strictEqual(P6_3_STRUCTURAL_PREFLIGHT_VERSION, "p6-3-el-structural-preflight-v1");
  assert.strictEqual(P6_3_CALIBRATION_REPEAT_COUNT, 12);
  assert.strictEqual(P6_3_MAX_ATTEMPTS_PER_LOGICAL_CELL, 3);
  assertP63Counterbalance();
  assertP63StructuralFreeze();

  assert.strictEqual(evidence.schemaVersion, P6_3_STRUCTURAL_PREFLIGHT_VERSION);
  assert.strictEqual(evidence.status, "structural-candidate-selected");
  assert.strictEqual(evidence.selectedMaxTokensPerUnit, P6_3_FROZEN_MAX_TOKENS_PER_UNIT);
  assert.strictEqual(evidence.fullPayloadTokens, P6_3_FROZEN_FULL_PAYLOAD_TOKENS);
  assert.deepStrictEqual(evidence.primaryTaskIds, [...P6_2_PRIMARY_TASK_IDS]);
  assert.strictEqual(evidence.candidateResults[0]?.maxTokensPerUnit, P6_3_FROZEN_MAX_TOKENS_PER_UNIT);
  assert.strictEqual(evidence.candidateResults[0]?.ok, true);

  const fullPayloadTokens = countStaticRepositoryPayloadTokens(repository);
  assert.strictEqual(fullPayloadTokens, P6_3_FROZEN_FULL_PAYLOAD_TOKENS);
  const budgetGrid = buildP63BudgetGrid(fullPayloadTokens);
  assert.deepStrictEqual(
    budgetGrid.finite.map((entry) => entry.nominalTokens),
    [...P6_3_FROZEN_FINITE_BUDGET_TOKENS]
  );
  assert.deepStrictEqual(
    [evidence.budgetGrid.B0, evidence.budgetGrid.B1, evidence.budgetGrid.B2, evidence.budgetGrid.B3, evidence.budgetGrid.B4],
    [...P6_3_FROZEN_FINITE_BUDGET_TOKENS]
  );
  assert.strictEqual(evidence.budgetGrid.AF, fullPayloadTokens);

  for (const taskId of P6_2_PRIMARY_TASK_IDS) {
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    assert(task?.groundTruthDelta && task.namingScheme, `Missing frozen EL selector inputs for ${taskId}`);
    const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === task.namingScheme);
    assert(namingScheme, `Missing naming scheme for ${taskId}: ${task.namingScheme}`);
    const finite = budgetGrid.finite.map((budget) =>
      buildElTaskStaticExposure({
        repositoryFiles: repository,
        groundTruth,
        delta: task.groundTruthDelta!,
        namingScheme,
        budgetTokens: budget.nominalTokens,
        maxTokensPerUnit: P6_3_FROZEN_MAX_TOKENS_PER_UNIT,
      })
    );
    const full = buildElTaskStaticExposure({
      repositoryFiles: repository,
      groundTruth,
      delta: task.groundTruthDelta!,
      namingScheme,
      budgetTokens: fullPayloadTokens,
      maxTokensPerUnit: P6_3_FROZEN_MAX_TOKENS_PER_UNIT,
    });
    assertProfile(taskId, finite, full, repository, evidence.selectedProfiles[taskId]);
  }

  const booleanProbes = probes.filter((probe) =>
    probe.type === "boolean" &&
    (probe.derivedFrom as Record<string, unknown>).designVersion === STAGE1_BOOLEAN_DESIGN_VERSION
  );
  assert.strictEqual(booleanProbes.length, 12);
  const sanitized = sanitizeElRsemSelectorProbes(booleanProbes);
  const schemeIds = [...new Set(sanitized.map((probe) => probe.namingScheme))];
  assert.strictEqual(schemeIds.length, 1);
  const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === schemeIds[0]);
  assert(namingScheme, `Missing Rsem naming scheme: ${schemeIds[0]}`);
  const rsemPlan = buildElRsemBankPlan({
    repositoryFiles: repository,
    groundTruth,
    namingScheme,
    probes: sanitized,
  });
  assert.strictEqual(rsemPlan.planInputSha256, P6_3_FROZEN_RSEM_PLAN_INPUT_SHA256);
  assert.strictEqual(rsemPlan.planInputSha256, evidence.rsem.planInputSha256);
  assert.deepStrictEqual(rsemPlan.probeIds, evidence.rsem.probeIds);
  assert.deepStrictEqual(rsemPlan.unionEntities, evidence.rsem.unionEntities);

  const rsemFinite = budgetGrid.finite.map((budget) =>
    buildElRsemBankStaticExposure({
      repositoryFiles: repository,
      plan: rsemPlan,
      budgetTokens: budget.nominalTokens,
      maxTokensPerUnit: P6_3_FROZEN_MAX_TOKENS_PER_UNIT,
    })
  );
  const rsemFull = buildElRsemBankStaticExposure({
    repositoryFiles: repository,
    plan: rsemPlan,
    budgetTokens: fullPayloadTokens,
    maxTokensPerUnit: P6_3_FROZEN_MAX_TOKENS_PER_UNIT,
  });
  assertProfile("Rsem-bank", rsemFinite, rsemFull, repository, evidence.selectedProfiles["Rsem-bank"]);

  verifyForbiddenInputGuard(sanitized, rsemPlan.planInputSha256, repository, groundTruth, namingScheme);
  verifyBudgetSelectionRule();

  console.log(JSON.stringify({
    status: "ok",
    designVersion: P6_3_EL_CALIBRATION_DESIGN_VERSION,
    structuralPreflightVersion: P6_3_STRUCTURAL_PREFLIGHT_VERSION,
    fullPayloadTokens,
    frozenMaxTokensPerUnit: P6_3_FROZEN_MAX_TOKENS_PER_UNIT,
    finiteBudgets: [...P6_3_FROZEN_FINITE_BUDGET_TOKENS],
    rsemPlanInputSha256: rsemPlan.planInputSha256,
    primaryTasksVerified: P6_2_PRIMARY_TASK_IDS.length,
    rsemProbesVerified: rsemPlan.probeIds.length,
  }, null, 2));
}

function assertProfile(
  planId: string,
  finite: ElStaticExposureResult[],
  full: ElStaticExposureResult,
  repository: Record<string, string>,
  expected: EvidenceProfile | undefined
): void {
  assert(expected, `Missing committed structural profile for ${planId}`);
  const actualTokens = finite.map((entry) => entry.log.actualPayloadTokens);
  const unitCounts = finite.map((entry) => entry.log.selectedUnitIds.length);
  assert.deepStrictEqual(actualTokens, expected.actualTokens, `${planId}: token profile drifted`);
  assert.deepStrictEqual(unitCounts, expected.selectedUnitCounts, `${planId}: unit-count profile drifted`);
  assert.strictEqual(actualTokens[0], 0);
  for (let index = 1; index < actualTokens.length; index++) {
    assert(actualTokens[index] > actualTokens[index - 1], `${planId}: finite dose collapse`);
    assert.deepStrictEqual(
      finite[index].log.selectedUnitIds.slice(0, finite[index - 1].log.selectedUnitIds.length),
      finite[index - 1].log.selectedUnitIds,
      `${planId}: non-nested exposure prefix`
    );
  }
  assert.strictEqual(new Set(finite.slice(1).map((entry) => entry.log.exposureSha256)).size, 4);
  assert.deepStrictEqual(full.contextFiles, repository, `${planId}: AF parity failed`);
  assert.strictEqual(full.log.actualPayloadTokens, P6_3_FROZEN_FULL_PAYLOAD_TOKENS);
}

function verifyForbiddenInputGuard(
  sanitized: ReturnType<typeof sanitizeElRsemSelectorProbes>,
  expectedHash: string,
  repository: Record<string, string>,
  groundTruth: GroundTruth,
  namingScheme: NamingScheme
): void {
  const polluted = sanitized.map((probe, index) =>
    index === 0 ? ({ ...probe, correctAnswer: true } as any) : probe
  );
  assert.throws(
    () => buildElRsemBankPlan({ repositoryFiles: repository, groundTruth, namingScheme, probes: polluted }),
    /forbidden\/unversioned probe field correctAnswer/
  );
  const clean = buildElRsemBankPlan({ repositoryFiles: repository, groundTruth, namingScheme, probes: sanitized });
  assert.strictEqual(clean.planInputSha256, expectedHash);
}

function verifyBudgetSelectionRule(): void {
  const selected = selectP63ExposureBudget(
    { M0: 0.1, MAF: 0.9, R0: 0.1, RAF: 0.9 },
    [
      { label: "B1", nominalTokens: 505, M: 0.3, R: 0.3 },
      { label: "B2", nominalTokens: 1011, M: 0.5, R: 0.5 },
      { label: "B3", nominalTokens: 2023, M: 0.7, R: 0.7 },
      { label: "B4", nominalTokens: 3034, M: 0.8, R: 0.8 },
    ]
  );
  assert.strictEqual(selected.status, "selected");
  assert.strictEqual(selected.selected?.label, "B1", "smallest qualifying budget must win");

  const noInterior = selectP63ExposureBudget(
    { M0: 0.80, MAF: 0.90, R0: 0.1, RAF: 0.9 },
    [{ label: "B1", nominalTokens: 505, M: 0.85, R: 0.5 }]
  );
  assert.strictEqual(noInterior.status, "needs-design-audit");
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
