import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GroundTruthDelta } from "../synthetic-world/schema";
import { buildOpenAIUserMessage } from "./src/agent-backend/openai/shared";
import { validateRawRunConfig, validateResolvedRunConfig } from "./src/config/validate";
import { assembleELTaskStaticExposure } from "./src/context/el-static-exposure-runtime";
import {
  countStaticRepositoryPayloadTokens,
  serializeStaticRepositoryPayload,
} from "./src/context/static-exposure";
import type { RunConfig } from "./src/types";

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

const repoRoot = path.resolve(__dirname, "..");
const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
const repository = loadRepositoryFiles(path.join(syntheticWorldDir, "repository"));
const tasks = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")
) as HeldOutTask[];
const task = tasks.find((candidate) => candidate.taskId === "T-crosscut-1");
assert(task, "T-crosscut-1 fixture must exist");
assert(task.groundTruthDelta, "EL verifier task must carry GroundTruthDelta");
assert(task.namingScheme, "EL verifier task must carry namingScheme");

const fullPayload = serializeStaticRepositoryPayload(repository);
const fullTokens = countStaticRepositoryPayloadTokens(repository);
assert(fullTokens > 0);

// The frozen EL static serializer must reproduce the exact repository artifact
// bytes used by the existing AF prompt builder without modifying that builder.
const visibleInstruction = "serializer parity check";
const afPrompt = buildOpenAIUserMessage({
  contextFiles: repository,
  visibleInstruction,
  previousInteractionRecord: null,
  contextBudget: "full",
});
const expectedPrompt =
  `CURRENT TASK:\n${visibleInstruction}` +
  `\nCURRENT REPOSITORY:${fullPayload}` +
  "\nImplement the change and return the structured repository mutation.";
assert.strictEqual(afPrompt, expectedPrompt, "EL static serializer must be byte-identical to AF repository framing");

const maxTokensPerUnit = 256;
const budgets = [
  0,
  Math.floor(fullTokens / 8),
  Math.floor(fullTokens / 4),
  Math.floor(fullTokens / 2),
  Math.floor((3 * fullTokens) / 4),
  fullTokens,
];
const exposures = budgets.map((contextBudget) => assembleELTaskStaticExposure({
  config: makeConfig(contextBudget, maxTokensPerUnit),
  task,
  repositoryFiles: repository,
}));

assert.strictEqual(exposures[0].selectedUnitIds.length, 0, "B=0 must expose zero ArtifactUnits");
assert.deepStrictEqual(exposures[0].contextFiles, {}, "B=0 must expose no repository files");
assert.strictEqual(exposures[0].log.actualExposedTokens, 0);

for (let i = 0; i < exposures.length; i++) {
  const exposure = exposures[i];
  assert(exposure.log.actualExposedTokens <= budgets[i], "actual static payload must respect B_expose");
  assert.strictEqual(
    exposure.log.actualExposedTokens,
    countStaticRepositoryPayloadTokens(exposure.contextFiles),
    "logged B_expose usage must count the exact model-visible static payload"
  );
  assert.deepStrictEqual(
    exposure.selectedUnitIds,
    exposure.orderedUnitIds.slice(0, exposure.selectedUnitIds.length),
    "EL must select a whole-unit prefix and never skip in later units"
  );
  if (i > 0) {
    const previous = exposures[i - 1];
    assert.deepStrictEqual(
      exposure.selectedUnitIds.slice(0, previous.selectedUnitIds.length),
      previous.selectedUnitIds,
      "larger budgets must preserve the smaller-budget prefix"
    );
    assert(
      exposure.log.actualExposedTokens >= previous.log.actualExposedTokens,
      "actual exposure tokens must be non-decreasing"
    );
  }
}

const fullExposure = exposures[exposures.length - 1];
assert.deepStrictEqual(
  fullExposure.contextFiles,
  repository,
  "B_expose=T_EL must reconstruct the complete repository byte-for-byte"
);
assert.strictEqual(fullExposure.log.actualExposedTokens, fullTokens);
assert.strictEqual(fullExposure.log.fullRepositoryTokens, fullTokens);
assert.strictEqual(fullExposure.selectedUnitIds.length, fullExposure.orderedUnitIds.length);

const repeated = assembleELTaskStaticExposure({
  config: makeConfig(Math.floor(fullTokens / 2), maxTokensPerUnit),
  task,
  repositoryFiles: repository,
});
assert.strictEqual(
  repeated.log.selectorPlanHash,
  exposures[3].log.selectorPlanHash,
  "selector plan must be deterministic for the same frozen inputs"
);
assert.strictEqual(repeated.log.exposureSetHash, exposures[3].log.exposureSetHash);
assert.strictEqual(repeated.log.staticPayloadHash, exposures[3].log.staticPayloadHash);

assert.throws(
  () => assembleELTaskStaticExposure({
    config: makeConfig(100, 0),
    task,
    repositoryFiles: repository,
  }),
  /positive integer staticExposureMaxTokensPerUnit/
);

const validRaw = {
  runClass: "smoke",
  backend: "mock-noop",
  condition: "EL",
  contextBudget: 0,
  staticExposureMaxTokensPerUnit: 256,
};
assert.doesNotThrow(() => validateRawRunConfig(validRaw));
const {
  staticExposureMaxTokensPerUnit: _omittedChunkBudget,
  ...missingChunkBudget
} = validRaw;
assert.throws(
  () => validateRawRunConfig(missingChunkBudget),
  /explicitly specify raw config field "staticExposureMaxTokensPerUnit"/
);
assert.throws(
  () => validateRawRunConfig({ ...validRaw, staticExposureMaxTokensPerUnit: undefined }),
  /staticExposureMaxTokensPerUnit to be a positive integer/
);
assert.throws(
  () => validateRawRunConfig({ ...validRaw, contextBudget: "full" }),
  /non-negative integer contextBudget representing B_expose/
);
assert.doesNotThrow(() => validateResolvedRunConfig(makeConfig(0, 256)));
assert.throws(
  () => validateResolvedRunConfig({
    ...makeConfig(0, 256),
    staticExposureMaxTokensPerUnit: undefined,
  }),
  /staticExposureMaxTokensPerUnit to be a positive integer/
);

console.log(JSON.stringify({
  status: "ok",
  fullRepositoryTokens: fullTokens,
  maxTokensPerUnit,
  selectorPlanHash: fullExposure.log.selectorPlanHash,
  budgets: exposures.map((exposure) => ({
    nominal: exposure.log.budgetTokens,
    actual: exposure.log.actualExposedTokens,
    selectedUnits: exposure.log.selectedUnitCount,
    exposureSetHash: exposure.log.exposureSetHash,
  })),
}, null, 2));

function makeConfig(
  contextBudget: number,
  staticExposureMaxTokensPerUnit: number
): RunConfig {
  return {
    experimentId: "verify-el-static-exposure",
    lineageId: "lineage-0",
    runClass: "smoke",
    backend: "mock-noop",
    condition: "EL",
    contextBudget,
    staticExposureMaxTokensPerUnit,
    generations: 1,
    tasks: [task!.taskId],
    syntheticWorldDir,
    runsDir: path.join(repoRoot, "runs", "_smoke"),
  };
}

function loadRepositoryFiles(repositoryDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  walk(repositoryDir, "", files);
  return files;
}

function walk(
  root: string,
  relativeDir: string,
  target: Record<string, string>
): void {
  const absoluteDir = path.join(root, relativeDir);
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDir.split(path.sep).join("/"), entry.name);
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      walk(root, relativePath, target);
    } else if (entry.isFile()) {
      target[relativePath] = fs.readFileSync(absolutePath, "utf8");
    }
  }
}
