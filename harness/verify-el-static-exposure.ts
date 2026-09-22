import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../synthetic-world/schema";
import { buildOpenAIUserMessage } from "./src/agent-backend/openai/shared";
import {
  buildElTaskStaticExposure,
  buildStaticExposureFromRankedPaths,
  countStaticRepositoryPayloadTokens,
  EL_STATIC_EXPOSURE_SCHEMA_VERSION,
  EL_STATIC_REPOSITORY_SERIALIZER_VERSION,
  EL_TASK_SELECTOR_VERSION,
  serializeStaticRepositoryPayload,
} from "./src/context/el-static-exposure";
import { buildElStaticExposureForTask } from "./src/context/el-static-exposure-dispatcher";
import { runGenerationLoop } from "./src/orchestrator";
import type { RunConfig } from "./src/types";

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

async function main(): Promise<void> {
  const syntheticWorldDir = path.join(__dirname, "../synthetic-world");
  const repository = loadRepository(path.join(syntheticWorldDir, "repository"));
  const groundTruth = loadJson<GroundTruth>(path.join(syntheticWorldDir, "ground_truth.json"));
  const namingSchemes = loadJson<NamingScheme[]>(path.join(syntheticWorldDir, "naming_schemes.json"));
  const tasks = loadJson<HeldOutTask[]>(path.join(syntheticWorldDir, "heldout_tasks.json"));
  const task = tasks.find((candidate) => candidate.taskId === "T-crosscut-1");
  assert(task?.groundTruthDelta, "T-crosscut-1 must carry GroundTruthDelta");
  assert(task.namingScheme, "T-crosscut-1 must carry namingScheme");
  const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === task.namingScheme);
  assert(namingScheme, `Naming scheme not found: ${task.namingScheme}`);

  const payload = serializeStaticRepositoryPayload(repository);
  const fullPayloadTokens = countStaticRepositoryPayloadTokens(repository);
  assert(fullPayloadTokens > 0);

  const message = buildOpenAIUserMessage({
    contextFiles: repository,
    visibleInstruction: "serializer parity fixture",
    previousInteractionRecord: null,
    contextBudget: "full",
  });
  assert.strictEqual(
    message,
    `CURRENT TASK:\nserializer parity fixture\nCURRENT REPOSITORY:${payload}\nImplement the change and return the structured repository mutation.`,
    "EL static serializer must match the exact AF repository payload framing"
  );

  const maxTokensPerUnit = 512;
  const zero = buildElTaskStaticExposure({
    repositoryFiles: repository,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    budgetTokens: 0,
    maxTokensPerUnit,
  });
  assert.deepStrictEqual(zero.contextFiles, {});
  assert.strictEqual(zero.log.actualPayloadTokens, 0);
  assert.strictEqual(zero.log.fullPayloadTokens, fullPayloadTokens);
  assert.strictEqual(zero.log.selectorPolicyVersion, EL_TASK_SELECTOR_VERSION);
  assert.strictEqual(zero.log.schemaVersion, EL_STATIC_EXPOSURE_SCHEMA_VERSION);
  assert.strictEqual(
    zero.log.staticRepositorySerializerVersion,
    EL_STATIC_REPOSITORY_SERIALIZER_VERSION
  );

  const smallBudget = Math.floor(fullPayloadTokens / 4);
  const largeBudget = Math.floor(fullPayloadTokens / 2);
  const small = buildElTaskStaticExposure({
    repositoryFiles: repository,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    budgetTokens: smallBudget,
    maxTokensPerUnit,
  });
  const smallAgain = buildElTaskStaticExposure({
    repositoryFiles: repository,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    budgetTokens: smallBudget,
    maxTokensPerUnit,
  });
  const large = buildElTaskStaticExposure({
    repositoryFiles: repository,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    budgetTokens: largeBudget,
    maxTokensPerUnit,
  });
  assert(small.log.actualPayloadTokens <= smallBudget);
  assert(large.log.actualPayloadTokens <= largeBudget);
  assert.deepStrictEqual(
    large.log.selectedUnitIds.slice(0, small.log.selectedUnitIds.length),
    small.log.selectedUnitIds,
    "larger EL budget must extend the same frozen unit prefix"
  );
  assert.strictEqual(smallAgain.log.orderedPlanSha256, small.log.orderedPlanSha256);
  assert.strictEqual(smallAgain.log.exposureSha256, small.log.exposureSha256);
  assert.deepStrictEqual(smallAgain.contextFiles, small.contextFiles);
  assert.strictEqual(sumCategoryTokens(small), small.log.actualPayloadTokens);

  const full = buildElTaskStaticExposure({
    repositoryFiles: repository,
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    budgetTokens: fullPayloadTokens,
    maxTokensPerUnit,
  });
  assert.deepStrictEqual(
    full.contextFiles,
    repository,
    "EL full-prefix must reconstruct exactly the AF repository snapshot"
  );
  assert.strictEqual(full.log.actualPayloadTokens, fullPayloadTokens);
  assert.strictEqual(full.log.selectedUnitIds.length, full.log.orderedUnitIds.length);

  verifyNoSkipIn();

  const dispatcherConfig: RunConfig = {
    experimentId: "verify-el-static-dispatcher",
    lineageId: "lineage-0",
    runClass: "smoke",
    backend: "mock-noop",
    condition: "EL",
    contextBudget: smallBudget,
    staticExposureMaxTokensPerUnit: maxTokensPerUnit,
    generations: 1,
    tasks: [task.taskId],
    syntheticWorldDir,
    runsDir: path.join(os.tmpdir(), "aidd-ilm-el-static-dispatcher-unused"),
  };
  const dispatched = buildElStaticExposureForTask({
    config: dispatcherConfig,
    task,
    repositoryFiles: repository,
  });
  assert.strictEqual(dispatched.log.orderedPlanSha256, small.log.orderedPlanSha256);
  assert.strictEqual(dispatched.log.exposureSha256, small.log.exposureSha256);

  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-el-static-runtime-"));
  try {
    const config: RunConfig = {
      ...dispatcherConfig,
      experimentId: "verify-el-static-runtime",
      runsDir,
    };
    const run = await runGenerationLoop(config);
    assert.strictEqual(run.crashed, false, run.crashError);
    assert.strictEqual(run.completedGenerations, 1);
    assert.strictEqual(run.logDirs.length, 1);

    const meta = loadJson<any>(path.join(run.logDirs[0], "meta.json"));
    const exposureLog = loadJson<any>(path.join(run.logDirs[0], "static_exposure.json"));
    assert.strictEqual(meta.condition, "EL");
    assert.strictEqual(meta.actual_context_tokens, exposureLog.actualPayloadTokens);
    assert.strictEqual(exposureLog.schemaVersion, EL_STATIC_EXPOSURE_SCHEMA_VERSION);
    assert.strictEqual(exposureLog.nominalBudgetTokens, smallBudget);
    assert.strictEqual(exposureLog.exposureSha256, small.log.exposureSha256);
    assert.strictEqual(meta.static_exposure.exposure_sha256, small.log.exposureSha256);
    assert.strictEqual(meta.retrieved_episode, null);
  } finally {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    status: "ok",
    serializerVersion: EL_STATIC_REPOSITORY_SERIALIZER_VERSION,
    selectorVersion: EL_TASK_SELECTOR_VERSION,
    fullPayloadTokens,
    small: {
      nominal: smallBudget,
      actual: small.log.actualPayloadTokens,
      selectedUnits: small.log.selectedUnitIds.length,
    },
    large: {
      nominal: largeBudget,
      actual: large.log.actualPayloadTokens,
      selectedUnits: large.log.selectedUnitIds.length,
    },
  }, null, 2));
}

function verifyNoSkipIn(): void {
  const longPath = `src/${"very-long-path-".repeat(8)}a.ts`;
  const shortPath = "b.ts";
  const repository = {
    [longPath]: `${"const veryLongValue = 1; ".repeat(120)}\n`,
    [shortPath]: "x\n",
  };
  const ranked = [
    { path: longPath, category: "implementation" as const },
    { path: shortPath, category: "implementation" as const },
  ];
  const reverse = [...ranked].reverse();
  const maxTokensPerUnit = 64;
  const allForward = buildStaticExposureFromRankedPaths({
    repositoryFiles: repository,
    rankedPaths: ranked,
    selectorPolicyVersion: "verify-no-skip-forward",
    budgetTokens: 100_000,
    maxTokensPerUnit,
  });
  const allReverse = buildStaticExposureFromRankedPaths({
    repositoryFiles: repository,
    rankedPaths: reverse,
    selectorPolicyVersion: "verify-no-skip-reverse",
    budgetTokens: 100_000,
    maxTokensPerUnit,
  });
  const firstLongCost = allForward.log.selectedUnits[0]?.marginalPayloadTokens ?? 0;
  const firstShortCost = allReverse.log.selectedUnits[0]?.marginalPayloadTokens ?? 0;
  assert(firstLongCost > firstShortCost + 1, "fixture must make the first long-path unit more expensive");

  const budget = firstLongCost - 1;
  assert(firstShortCost <= budget, "short-path unit must fit the no-skip fixture budget");
  const blocked = buildStaticExposureFromRankedPaths({
    repositoryFiles: repository,
    rankedPaths: ranked,
    selectorPolicyVersion: "verify-no-skip-forward",
    budgetTokens: budget,
    maxTokensPerUnit,
  });
  assert.strictEqual(
    blocked.log.selectedUnitIds.length,
    0,
    "EL must stop at the first non-fitting ranked unit instead of packing a later smaller unit"
  );
}

function sumCategoryTokens(result: ReturnType<typeof buildElTaskStaticExposure>): number {
  return Object.values(result.log.categoryStats).reduce(
    (sum, row) => sum + row.marginalPayloadTokens,
    0
  );
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
