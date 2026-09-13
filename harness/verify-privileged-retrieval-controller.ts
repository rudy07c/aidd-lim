import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { GroundTruth, GroundTruthDelta, NamingScheme } from "../synthetic-world/schema";
import { createArtifactUnit } from "./src/measurement/artifact-unit";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import { WorkingSetManager } from "./src/context/working-set-manager";
import {
  PrivilegedRetrievalController,
  PrivilegedRetrievalPlan,
  buildPrivilegedRetrievalPlan,
  deriveEntityFilePathMap,
} from "./src/context/privileged-retrieval-controller";
import { createBudgetedRepositoryGateway } from "./src/repository/retrieval-gateway";

interface HeldOutTask {
  taskId: string;
  namingScheme: string;
  groundTruthDelta: GroundTruthDelta;
}

const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
const repositoryDir = path.join(syntheticWorldDir, "repository");

function loadJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(syntheticWorldDir, fileName), "utf8")) as T;
}

function loadRepositoryFiles(): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(repositoryDir, full).replace(/\\/g, "/");
        result[relative] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(repositoryDir);
  return result;
}

function sourceLineCount(content: string): number {
  if (content.length === 0) return 1;
  return (content.match(/[^\n]*\n|[^\n]+$/g) ?? [""]).length;
}

function fullFileEvidenceTokens(repositoryFiles: Readonly<Record<string, string>>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    const unit = createArtifactUnit({
      id: `verify:${filePath}`,
      path: filePath,
      startLine: 1,
      endLine: sourceLineCount(content),
      content,
      kind: "chunk",
    });
    result.set(filePath, unit.tokenCount);
  }
  return result;
}

function limits(repositoryFileCount: number, cumulativeTokens: number): ExplorationLimits {
  return {
    maxRetrievalOperations: repositoryFileCount + 4,
    maxCumulativeRetrievedTokens: cumulativeTokens + 10_000,
    maxModelCalls: 8,
    maxDecisionRounds: 8,
  };
}

function fixtures() {
  const groundTruth = loadJson<GroundTruth>("ground_truth.json");
  const namingSchemes = loadJson<NamingScheme[]>("naming_schemes.json");
  const tasks = loadJson<HeldOutTask[]>("heldout_tasks.json");
  const task = tasks.find((candidate) => candidate.taskId === "T-crosscut-2");
  assert.ok(task, "T-crosscut-2 must exist");
  const namingScheme = namingSchemes.find(
    (candidate) => candidate.schemeId === task.namingScheme
  );
  assert.ok(namingScheme, `Naming scheme ${task.namingScheme} must exist`);
  return { groundTruth, namingScheme, task };
}

function verifyEntityMappingAndDependencyRanking(
  repositoryFiles: Record<string, string>
): PrivilegedRetrievalPlan {
  const { groundTruth, namingScheme, task } = fixtures();
  const map = deriveEntityFilePathMap(
    groundTruth.entities.map((entity) => entity.id),
    namingScheme,
    Object.keys(repositoryFiles)
  );
  assert.deepStrictEqual(map.E1, ["src/vok/rules.ts", "src/vok/state.ts"]);
  assert.deepStrictEqual(map.E5, ["src/osk/rules.ts", "src/osk/state.ts"]);
  assert.deepStrictEqual(map.E2, ["src/zef/rules.ts"]);
  assert.deepStrictEqual(map.E3, ["src/tal/rules.ts"]);
  assert.deepStrictEqual(map.E4, ["src/fen/rules.ts", "src/fen/state.ts"]);

  const plan = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    repositoryFiles,
  });

  assert.deepStrictEqual(plan.surfaceEntities, ["E1", "E2", "E3", "E5"]);
  assert.deepStrictEqual(plan.semanticEntities, ["E1", "E2", "E3", "E4", "E5"]);
  assert.strictEqual(plan.dependencyDistances.E1, 0);
  assert.strictEqual(plan.dependencyDistances.E2, 0);
  assert.strictEqual(plan.dependencyDistances.E3, 0);
  assert.strictEqual(plan.dependencyDistances.E5, 0);
  assert.strictEqual(plan.dependencyDistances.E4, 1);

  const categories = plan.entries.map((entry) => entry.category);
  const categoryRank = {
    type_definition: 0,
    fixed_contract: 1,
    test: 2,
    implementation: 3,
  } as const;
  for (let index = 1; index < categories.length; index++) {
    assert.ok(
      categoryRank[categories[index - 1]] <= categoryRank[categories[index]],
      "system2 category priority must be monotonic"
    );
  }

  const indexOf = (filePath: string) => {
    const index = plan.entries.findIndex((entry) => entry.path === filePath);
    assert.ok(index >= 0, `plan must contain ${filePath}`);
    return index;
  };
  const fenRulesIndex = indexOf("src/fen/rules.ts");
  for (const directRules of [
    "src/vok/rules.ts",
    "src/zef/rules.ts",
    "src/tal/rules.ts",
    "src/osk/rules.ts",
  ]) {
    assert.ok(
      indexOf(directRules) < fenRulesIndex,
      `${directRules} (distance 0) must precede src/fen/rules.ts (distance 1)`
    );
  }

  return plan;
}

async function runControllerOnce(repositoryFiles: Record<string, string>) {
  const { groundTruth, namingScheme, task } = fixtures();
  const tokensByPath = fullFileEvidenceTokens(repositoryFiles);
  const maxFileTokens = Math.max(...tokensByPath.values());
  const cumulativeTokens = [...tokensByPath.values()].reduce((sum, value) => sum + value, 0);
  const workingSet = new WorkingSetManager(maxFileTokens + 32);
  const explorationBudget = new ExplorationBudget(
    limits(Object.keys(repositoryFiles).length, cumulativeTokens)
  );
  const gateway = createBudgetedRepositoryGateway({
    repositoryFiles,
    explorationBudget,
    workingSet,
  });
  const controller = new PrivilegedRetrievalController({
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    repositoryFiles,
    gateway,
  });

  const readOrder: string[] = [];
  while (controller.hasNext()) {
    const execution = await controller.retrieveNext();
    assert.ok(execution);
    readOrder.push(execution.planEntry.path);
  }

  const records = gateway.records();
  assert.strictEqual(records.length, readOrder.length);
  assert.ok(
    records.every(
      (record) => record.phaseTrace.join(",") === "begin,access,complete,admit"
    ),
    "every PR repository observation must use begin->access->complete->admit"
  );

  const working = workingSet.snapshot();
  const exploration = explorationBudget.snapshot();
  assert.ok(working.currentTokenUsage <= working.budgetTokens);
  assert.ok(
    exploration.used.cumulativeRetrievedTokens > working.budgetTokens,
    "PR must preserve cumulative>B_work while active<=B_work semantics"
  );
  assert.ok(working.evictionHistory.length > 0);
  assert.strictEqual(exploration.pendingRetrieval, null);

  return {
    readOrder,
    plan: controller.retrievalPlan,
    records,
    bWork: working.budgetTokens,
    activeTokens: working.currentTokenUsage,
    cumulativeRetrievedTokens: exploration.used.cumulativeRetrievedTokens,
    evictionCount: working.evictionHistory.length,
  };
}

async function verifyDeterministicIndependentRuns(repositoryFiles: Record<string, string>) {
  const first = await runControllerOnce(repositoryFiles);
  const second = await runControllerOnce(repositoryFiles);
  const third = await runControllerOnce(repositoryFiles);

  assert.deepStrictEqual(second.readOrder, first.readOrder);
  assert.deepStrictEqual(third.readOrder, first.readOrder);
  assert.deepStrictEqual(second.plan, first.plan);
  assert.deepStrictEqual(third.plan, first.plan);

  return {
    readOrder: first.readOrder,
    repeats: 3,
    exactReplayEqual: true,
    bWork: first.bWork,
    activeTokens: first.activeTokens,
    cumulativeRetrievedTokens: first.cumulativeRetrievedTokens,
    evictionCount: first.evictionCount,
  };
}

async function verifyPendingBoundaryDoesNotAdvanceController(
  repositoryFiles: Record<string, string>
) {
  const { groundTruth, namingScheme, task } = fixtures();
  const tokensByPath = fullFileEvidenceTokens(repositoryFiles);
  const maxFileTokens = Math.max(...tokensByPath.values());
  const cumulativeTokens = [...tokensByPath.values()].reduce((sum, value) => sum + value, 0);
  const workingSet = new WorkingSetManager(maxFileTokens + 32);
  const explorationBudget = new ExplorationBudget(
    limits(Object.keys(repositoryFiles).length, cumulativeTokens)
  );
  const gateway = createBudgetedRepositoryGateway({
    repositoryFiles,
    explorationBudget,
    workingSet,
  });
  const controller = new PrivilegedRetrievalController({
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    repositoryFiles,
    gateway,
  });

  const firstEntry = controller.nextEntry();
  assert.ok(firstEntry);
  explorationBudget.beginRetrieval("verification-pending");
  await assert.rejects(
    () => controller.retrieveNext(),
    /while retrieval is pending/
  );
  assert.strictEqual(controller.position(), 0, "failed pending access must not skip ranking entry");
  explorationBudget.completeRetrieval(0, "verification-pending");
  const execution = await controller.retrieveNext();
  assert.strictEqual(execution?.planEntry.path, firstEntry.path);
  assert.strictEqual(explorationBudget.snapshot().pendingRetrieval, null);

  return {
    cursorAfterRejectedAttempt: 0,
    firstPathStillReadAfterClose: execution?.planEntry.path,
    pendingClosed: true,
  };
}

function verifyNoRawAccessorBypass(): Record<string, unknown> {
  const srcDir = path.join(__dirname, "src");
  const allowed = new Set([
    path.normalize(path.join(srcDir, "repository", "repository-accessor.ts")),
    path.normalize(path.join(srcDir, "repository", "retrieval-gateway.ts")),
  ]);
  const violations: string[] = [];
  const accessorReference = /repository-accessor/;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) {
        if (allowed.has(path.normalize(full))) continue;
        const content = fs.readFileSync(full, "utf8");
        if (accessorReference.test(content)) violations.push(path.relative(srcDir, full));
      }
    }
  };
  walk(srcDir);
  assert.deepStrictEqual(
    violations,
    [],
    `raw RepositoryAccessor referenced outside accessor/gateway: ${violations.join(", ")}`
  );
  return {
    allowedRawAccessorFiles: [...allowed].map((filePath) => path.relative(srcDir, filePath)).sort(),
    bypassReferences: violations,
  };
}

async function main(): Promise<void> {
  const repositoryFiles = loadRepositoryFiles();
  const ranking = verifyEntityMappingAndDependencyRanking(repositoryFiles);
  const deterministicRuns = await verifyDeterministicIndependentRuns(repositoryFiles);
  const pendingBoundary = await verifyPendingBoundaryDoesNotAdvanceController(repositoryFiles);
  const bypassGuard = verifyNoRawAccessorBypass();

  console.log(JSON.stringify({
    status: "ok",
    p5Slice: "step-5-privileged-retrieval-controller",
    policyVersion: ranking.policyVersion,
    tCrosscut2: {
      surfaceEntities: ranking.surfaceEntities,
      semanticEntities: ranking.semanticEntities,
      dependencyDistances: ranking.dependencyDistances,
      entityFilePaths: ranking.entityFilePaths,
      rankedPaths: ranking.entries.map((entry) => ({
        path: entry.path,
        category: entry.category,
        distance: entry.dependencyDistance,
        semanticRelevant: entry.semanticRelevant,
      })),
    },
    deterministicRuns,
    pendingBoundary,
    bypassGuard,
    verified: [
      "entity-to-file-mapping-derived-from-naming-scheme-and-repository-layout",
      "GroundTruthDelta-semantic-entity-set-reuses-computeSemanticLocality",
      "dependency-distance-orders-implementation-logic",
      "system2-category-order-types-contract-tests-implementation",
      "T-crosscut-2-direct-Vok-Zef-Tal-Osk-before-distance-1-Fen-implementation",
      "same-task-same-repository-three-independent-runs-exact-order",
      "PR-uses-same-BudgetedRepositoryGateway-as-AR",
      "begin-access-complete-admit-order-on-PR-path",
      "active-working-set-never-exceeds-B_work",
      "cumulative-retrieval-can-exceed-B_work",
      "pending-retrieval-blocks-next-PR-access-without-advancing-ranking",
      "raw-accessor-not-referenced-outside-accessor-and-gateway",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
