import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../synthetic-world/schema";
import {
  chunkArtifactFile,
  type ArtifactUnit,
} from "./src/measurement/artifact-unit";
import type { ArtifactFileCategory } from "./src/measurement/file-classification";
import { countCanonicalTokens } from "./src/measurement/token-counter";
import {
  BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
  buildCategoryProportionalBlendedOrder,
} from "./src/context/blended-static-exposure-selector";
import {
  buildPrivilegedRetrievalPlan,
  type PrivilegedRetrievalPlan,
  type PrivilegedRetrievalPlanEntry,
} from "./src/context/privileged-retrieval-controller";
import {
  chooseStructurallyAcceptedNextCategory,
  P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER,
  P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
} from "./src/context/p6-3-v3-selector-structural-acceptance";
import { P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";

const MAX_TOKENS_PER_UNIT = 256;
const CATEGORIES = P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER;

interface AuditTask {
  taskId: string;
  namingScheme: string;
  groundTruthDelta: GroundTruthDelta;
}

interface PendingReferenceUnit {
  entry: PrivilegedRetrievalPlanEntry;
  unit: ArtifactUnit;
  contentTokens: number;
}

function emptyNumbers(): Record<ArtifactFileCategory, number> {
  return {
    type_definition: 0,
    fixed_contract: 0,
    test: 0,
    implementation: 0,
  };
}

function emptyQueues(): Record<ArtifactFileCategory, PendingReferenceUnit[]> {
  return {
    type_definition: [],
    fixed_contract: [],
    test: [],
    implementation: [],
  };
}

function loadRepository(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadRepository(full, baseDir, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function buildReferenceOrder(args: {
  ranking: PrivilegedRetrievalPlan;
  repositoryFiles: Readonly<Record<string, string>>;
}): Array<{ unit: ArtifactUnit; category: ArtifactFileCategory }> {
  const queues = emptyQueues();
  const full = emptyNumbers();
  const seen = new Set<string>();

  for (const entry of args.ranking.entries) {
    if (seen.has(entry.path)) throw new Error(`duplicate ranked path: ${entry.path}`);
    seen.add(entry.path);
    const content = args.repositoryFiles[entry.path];
    if (content === undefined) throw new Error(`missing ranked repository path: ${entry.path}`);
    full[entry.category] += countCanonicalTokens(content);
    for (const unit of chunkArtifactFile(entry.path, content, MAX_TOKENS_PER_UNIT)) {
      queues[entry.category].push({
        entry,
        unit,
        contentTokens: Math.max(1, countCanonicalTokens(unit.content)),
      });
    }
  }

  assert.deepEqual(
    [...seen].sort(),
    Object.keys(args.repositoryFiles).sort(),
    "privileged ranking must cover the actual synthetic-world repository exactly once"
  );

  const served = emptyNumbers();
  const ordered: Array<{ unit: ArtifactUnit; category: ArtifactFileCategory }> = [];
  while (CATEGORIES.some((category) => queues[category].length > 0)) {
    const availableCategories = CATEGORIES.filter((category) => queues[category].length > 0);
    const nextContentTokens: Record<ArtifactFileCategory, number | null> = {
      type_definition: queues.type_definition[0]?.contentTokens ?? null,
      fixed_contract: queues.fixed_contract[0]?.contentTokens ?? null,
      test: queues.test[0]?.contentTokens ?? null,
      implementation: queues.implementation[0]?.contentTokens ?? null,
    };
    const category = chooseStructurallyAcceptedNextCategory({
      availableCategories,
      servedContentTokens: served,
      fullContentTokens: full,
      nextContentTokens,
    });
    const next = queues[category].shift();
    if (!next) throw new Error(`reference scheduler queue underflow: ${category}`);
    served[category] += next.contentTokens;
    ordered.push({ unit: next.unit, category });
  }
  return ordered;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function categoryCounts(
  ordered: readonly { category: ArtifactFileCategory }[]
): Record<ArtifactFileCategory, number> {
  const counts = emptyNumbers();
  for (const entry of ordered) counts[entry.category] += 1;
  return counts;
}

function firstCategorySequence(
  ordered: readonly { category: ArtifactFileCategory }[],
  limit = 20
): ArtifactFileCategory[] {
  return ordered.slice(0, limit).map((entry) => entry.category);
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
    .filter((task) =>
      P6_2_PRIMARY_TASK_IDS.includes(
        String(task.taskId) as (typeof P6_2_PRIMARY_TASK_IDS)[number]
      )
    )
    .map((task): AuditTask => {
      if (typeof task.taskId !== "string") throw new Error("taskId missing");
      if (typeof task.namingScheme !== "string") {
        throw new Error(`${task.taskId}: namingScheme missing`);
      }
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

  const taskAssessments = tasks.map((task) => {
    const namingScheme = namingSchemes.find(
      (candidate) => candidate.schemeId === task.namingScheme
    );
    if (!namingScheme) throw new Error(`${task.taskId}: naming scheme not found`);

    const ranking = buildPrivilegedRetrievalPlan({
      groundTruth,
      delta: task.groundTruthDelta,
      namingScheme,
      repositoryFiles,
    });
    const productionA = buildCategoryProportionalBlendedOrder({
      ranking,
      repositoryFiles,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    });
    const productionB = buildCategoryProportionalBlendedOrder({
      ranking,
      repositoryFiles,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    });
    const reference = buildReferenceOrder({ ranking, repositoryFiles });

    const productionPairs = productionA.orderedUnits.map((entry) => [
      entry.unit.id,
      entry.category,
    ] as const);
    const repeatedPairs = productionB.orderedUnits.map((entry) => [
      entry.unit.id,
      entry.category,
    ] as const);
    const referencePairs = reference.map((entry) => [entry.unit.id, entry.category] as const);

    assert.deepEqual(
      productionPairs,
      repeatedPairs,
      `${task.taskId}: Candidate C is nondeterministic`
    );
    assert.deepEqual(
      productionPairs,
      referencePairs,
      `${task.taskId}: Candidate C violates frozen structural acceptance scheduler`
    );
    assert.equal(
      new Set(productionA.orderedUnits.map((entry) => entry.unit.id)).size,
      productionA.orderedUnits.length,
      `${task.taskId}: Candidate C duplicates artifact units`
    );

    return {
      taskId: task.taskId,
      namingScheme: task.namingScheme,
      accepted: true,
      unitCount: productionA.orderedUnits.length,
      categoryUnitCounts: categoryCounts(productionA.orderedUnits),
      firstCategorySequence: firstCategorySequence(productionA.orderedUnits),
      orderedUnitHash: sha256(JSON.stringify(productionPairs)),
    };
  });

  const report = {
    schemaVersion: "p6-3-v3-selector-promotion-assessment-v1",
    decisionBasis: "frozen-structural-acceptance-only",
    acceptanceSpecVersion: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
    assessedSelectorVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
    maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    primaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
    taskCount: taskAssessments.length,
    repositoryFileCount: Object.keys(repositoryFiles).length,
    scientificOutcomesRead: false,
    hiddenEvaluatorResultsRead: false,
    providerResponsesRead: false,
    fixedEnvironmentRead: false,
    passesStructuralAcceptance: taskAssessments.every((task) => task.accepted),
    promotionActionIfPass: "promote-under-new-final-selector-version",
    actionIfFail: "remain-in-design-audit-without-M-or-Rsem-tuning",
    liveAuthorization: false,
    tasks: taskAssessments,
  };

  assert.equal(report.passesStructuralAcceptance, true);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main();
