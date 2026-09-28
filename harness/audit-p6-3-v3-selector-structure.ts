import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../synthetic-world/schema";
import { P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";
import { chunkArtifactFile } from "./src/measurement/artifact-unit";
import {
  buildPrivilegedRetrievalPlan,
  type PrivilegedRetrievalPlan,
} from "./src/context/privileged-retrieval-controller";
import {
  buildStaticExposurePrefix,
  type StaticExposureOrderedUnit,
} from "./src/context/static-exposure";
import {
  BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
  buildCategoryProportionalBlendedOrder,
} from "./src/context/blended-static-exposure-selector";

const MAX_TOKENS_PER_UNIT = 256;
const BUDGETS = [0, 505, 1011, 2023, 3034, 4046] as const;

interface AuditTask {
  taskId: string;
  namingScheme: string;
  groundTruthDelta: GroundTruthDelta;
}

interface CategoryCounts {
  type_definition: number;
  fixed_contract: number;
  test: number;
  implementation: number;
}

interface SelectedUnitAudit {
  unitId: string;
  path: string;
  startLine: number;
  endLine: number;
  category: string;
  selectorSequence: number;
  semanticRelevant: boolean;
  dependencyDistance: number | null;
}

interface BudgetAudit {
  budget: number;
  actualExposedTokens: number;
  selectedUnitCount: number;
  categoryUnitCounts: CategoryCounts;
  selectedUnits: SelectedUnitAudit[];
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

function historicalOrder(
  ranking: PrivilegedRetrievalPlan,
  repositoryFiles: Readonly<Record<string, string>>
): StaticExposureOrderedUnit[] {
  const ordered: StaticExposureOrderedUnit[] = [];
  for (const entry of ranking.entries) {
    const content = repositoryFiles[entry.path];
    if (content === undefined) throw new Error(`missing repository path ${entry.path}`);
    for (const unit of chunkArtifactFile(entry.path, content, MAX_TOKENS_PER_UNIT)) {
      ordered.push({
        unit,
        selectorSequence: entry.sequence,
        category: entry.category,
        mappedEntities: [...entry.mappedEntities],
        semanticRelevant: entry.semanticRelevant,
        dependencyDistance: entry.dependencyDistance,
      });
    }
  }
  return ordered;
}

function auditBudgets(args: {
  orderedUnits: readonly StaticExposureOrderedUnit[];
  repositoryFiles: Readonly<Record<string, string>>;
  selectorId: string;
  rankingPolicyVersion: string;
  surfaceEntities: readonly string[];
  semanticEntities: readonly string[];
}): BudgetAudit[] {
  const rows: BudgetAudit[] = [];
  let previousSelected: string[] = [];
  for (const budget of BUDGETS) {
    const exposure = buildStaticExposurePrefix({
      orderedUnits: args.orderedUnits,
      fullRepositoryFiles: args.repositoryFiles,
      budgetTokens: budget,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
      artifactChunkerVersion: "artifact-unit-chunkArtifactFile-v1",
      selectorKind: "offline-structural-audit",
      selectorId: args.selectorId,
      rankingPolicyVersion: args.rankingPolicyVersion,
      selectorSurfaceEntities: args.surfaceEntities,
      selectorSemanticEntities: args.semanticEntities,
    });

    assert.deepEqual(
      exposure.selectedUnitIds.slice(0, previousSelected.length),
      previousSelected,
      `${args.selectorId}: budget=${budget} violated nested prefix exposure`
    );
    previousSelected = exposure.selectedUnitIds;
    rows.push({
      budget,
      actualExposedTokens: exposure.log.actualExposedTokens,
      selectedUnitCount: exposure.log.selectedUnitCount,
      categoryUnitCounts: exposure.log.categoryUnitCounts,
      selectedUnits: exposure.log.selectedUnits.map((unit) => ({
        unitId: unit.unitId,
        path: unit.path,
        startLine: unit.startLine,
        endLine: unit.endLine,
        category: unit.category,
        selectorSequence: unit.selectorSequence,
        semanticRelevant: unit.semanticRelevant,
        dependencyDistance: unit.dependencyDistance,
      })),
    });
  }
  return rows;
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const swDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(swDir, "repository");
  const repositoryFiles: Record<string, string> = {};
  loadRepository(repositoryDir, repositoryDir, repositoryFiles);

  const groundTruth = JSON.parse(
    fs.readFileSync(path.join(swDir, "ground_truth.json"), "utf8")
  ) as GroundTruth;
  const namingSchemes = JSON.parse(
    fs.readFileSync(path.join(swDir, "naming_schemes.json"), "utf8")
  ) as NamingScheme[];
  const rawTasks = JSON.parse(
    fs.readFileSync(path.join(swDir, "heldout_tasks.json"), "utf8")
  ) as Array<Record<string, unknown>>;

  const tasks = rawTasks
    .filter((task) => P6_2_PRIMARY_TASK_IDS.includes(String(task.taskId) as (typeof P6_2_PRIMARY_TASK_IDS)[number]))
    .map((task): AuditTask => {
      if (typeof task.taskId !== "string") throw new Error("taskId missing");
      if (typeof task.namingScheme !== "string") throw new Error(`${task.taskId}: namingScheme missing`);
      if (!task.groundTruthDelta || typeof task.groundTruthDelta !== "object") {
        throw new Error(`${task.taskId}: groundTruthDelta missing`);
      }
      return {
        taskId: task.taskId,
        namingScheme: task.namingScheme,
        groundTruthDelta: task.groundTruthDelta as GroundTruthDelta,
      };
    });

  assert.equal(tasks.length, P6_2_PRIMARY_TASK_IDS.length, "primary task bank mismatch");

  const output = tasks.map((task) => {
    const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === task.namingScheme);
    if (!namingScheme) throw new Error(`${task.taskId}: naming scheme not found`);

    const ranking = buildPrivilegedRetrievalPlan({
      groundTruth,
      delta: task.groundTruthDelta,
      namingScheme,
      repositoryFiles,
    });
    const historical = historicalOrder(ranking, repositoryFiles);
    const blendedA = buildCategoryProportionalBlendedOrder({
      ranking,
      repositoryFiles,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    });
    const blendedB = buildCategoryProportionalBlendedOrder({
      ranking,
      repositoryFiles,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    });

    assert.deepEqual(
      blendedA.orderedUnits.map((entry) => entry.unit.id),
      blendedB.orderedUnits.map((entry) => entry.unit.id),
      `${task.taskId}: blended selector is not deterministic`
    );
    assert.deepEqual(
      [...historical.map((entry) => entry.unit.id)].sort(),
      [...blendedA.orderedUnits.map((entry) => entry.unit.id)].sort(),
      `${task.taskId}: blended selector must be a permutation of the same artifact units`
    );

    return {
      taskId: task.taskId,
      historical: auditBudgets({
        orderedUnits: historical,
        repositoryFiles,
        selectorId: `historical:${task.taskId}`,
        rankingPolicyVersion: ranking.policyVersion,
        surfaceEntities: ranking.surfaceEntities,
        semanticEntities: ranking.semanticEntities,
      }),
      blended: auditBudgets({
        orderedUnits: blendedA.orderedUnits,
        repositoryFiles,
        selectorId: `blended:${task.taskId}`,
        rankingPolicyVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
        surfaceEntities: ranking.surfaceEntities,
        semanticEntities: ranking.semanticEntities,
      }),
      blendedCategoryFullContentTokens: blendedA.categoryFullContentTokens,
      blendedCategoryUnitCounts: blendedA.categoryUnitCounts,
    };
  });

  const report = {
    schemaVersion: "p6-3-v3-selector-structural-audit-v2",
    scientificOutcomesRead: false,
    hiddenEvaluatorResultsRead: false,
    budgets: [...BUDGETS],
    maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    selectorPolicyVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
    tasks: output,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main();
