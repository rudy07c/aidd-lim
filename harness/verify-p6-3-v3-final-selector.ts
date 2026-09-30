import assert from "assert";
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
  P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
  buildP63V3FinalStaticExposureOrder,
} from "./src/context/p6-3-v3-final-static-exposure-selector";
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

function referenceOrder(args: {
  ranking: PrivilegedRetrievalPlan;
  repositoryFiles: Readonly<Record<string, string>>;
}): Array<{ unitId: string; category: ArtifactFileCategory }> {
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
    "ranking must cover the actual synthetic-world repository exactly once"
  );

  const served = emptyNumbers();
  const result: Array<{ unitId: string; category: ArtifactFileCategory }> = [];
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
    if (!next) throw new Error(`reference queue underflow: ${category}`);
    served[category] += next.contentTokens;
    result.push({ unitId: next.unit.id, category });
  }
  return result;
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

  for (const task of tasks) {
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
    const prototype = buildCategoryProportionalBlendedOrder({
      ranking,
      repositoryFiles,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    });
    const finalPlan = buildP63V3FinalStaticExposureOrder({
      ranking,
      repositoryFiles,
      maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    });
    const reference = referenceOrder({ ranking, repositoryFiles });

    assert.equal(finalPlan.policyVersion, P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION);
    assert.equal(
      finalPlan.acceptanceSpecVersion,
      P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION
    );
    assert.equal(finalPlan.validatedPrototypeVersion, BLENDED_STATIC_EXPOSURE_POLICY_VERSION);

    const prototypeOrder = prototype.orderedUnits.map((entry) => ({
      unitId: entry.unit.id,
      category: entry.category,
    }));
    const finalOrder = finalPlan.orderedUnits.map((entry) => ({
      unitId: entry.unit.id,
      category: entry.category,
    }));
    assert.deepEqual(
      finalOrder,
      prototypeOrder,
      `${task.taskId}: promotion changed the validated prototype artifact order`
    );
    assert.deepEqual(
      finalOrder,
      reference,
      `${task.taskId}: final selector violates the frozen structural acceptance rule`
    );
  }

  const finalSource = fs.readFileSync(
    path.join(__dirname, "src", "context", "p6-3-v3-final-static-exposure-selector.ts"),
    "utf8"
  );
  const imports = [...finalSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  for (const forbidden of [
    "fixed-environment",
    "live-calibration",
    "rsem",
    "evaluator",
    "provider",
    "result-summary",
  ]) {
    assert(
      !imports.some((source) => source.toLowerCase().includes(forbidden)),
      `final selector imports prohibited dependency fragment: ${forbidden}`
    );
  }

  process.stdout.write(JSON.stringify({
    status: "ok",
    finalSelectorVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
    acceptanceSpecVersion: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
    validatedPrototypeVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
    primaryTaskCount: tasks.length,
    maxTokensPerUnit: MAX_TOKENS_PER_UNIT,
    selectorStructurallyFrozen: true,
    budgetGridFrozen: false,
    measurementSelectionRuleFrozen: false,
    liveEligible: false,
    scientificOutcomesRead: false,
    providerResponsesRead: false,
    fixedEnvironmentRead: false,
    verified: [
      "promotion-preserves-validated-prototype-order",
      "final-order-matches-predeclared-acceptance-rule-on-primary-task-bank",
      "final-provenance-pins-acceptance-spec-version",
      "final-provenance-pins-validated-prototype-version",
      "final-selector-excludes-scientific-outcome-runtime-dependencies",
    ],
  }, null, 2) + "\n");
}

main();
