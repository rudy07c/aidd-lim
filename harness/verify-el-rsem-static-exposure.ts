import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GroundTruth, NamingScheme } from "../synthetic-world/schema";
import {
  assembleELRSemBankStaticExposure,
  derivePromptUnionEntityIds,
} from "./src/context/el-rsem-static-exposure-runtime";
import { countStaticRepositoryPayloadTokens } from "./src/context/static-exposure";
import type { RunConfig } from "./src/types";

interface ProbeFixture {
  probeId: string;
  type: string;
  namingScheme: string;
  prompt: string;
  correctAnswer?: unknown;
  derivedFrom?: Record<string, unknown>;
}

const repoRoot = path.resolve(__dirname, "..");
const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
const repository = loadRepositoryFiles(path.join(syntheticWorldDir, "repository"));
const groundTruth = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8")
) as GroundTruth;
const namingSchemes = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8")
) as NamingScheme[];
const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === "A-obfuscated");
assert(namingScheme, "A-obfuscated naming scheme must exist");

const fixture = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "calibration/fixtures/probe-bank-stage1.json"), "utf8")
) as ProbeFixture[];
const booleanBank = fixture.filter((probe) => probe.type === "boolean");
assert.strictEqual(booleanBank.length, 12, "P6-3 primary Rsem bank must remain 12 boolean probes");
const prompts = booleanBank.map((probe) => probe.prompt);

const unionEntities = derivePromptUnionEntityIds(prompts, groundTruth, namingScheme);
assert.deepStrictEqual(
  unionEntities,
  groundTruth.entities.map((entity) => entity.id).sort(),
  "the frozen 12-probe bank currently mentions every synthetic-world entity"
);

const fullTokens = countStaticRepositoryPayloadTokens(repository);
const halfConfig = makeConfig(Math.floor(fullTokens / 2));
const exposure = assembleELRSemBankStaticExposure({
  config: halfConfig,
  probePrompts: prompts,
  namingSchemeId: namingScheme.schemeId,
  repositoryFiles: repository,
});
assert.strictEqual(exposure.log.selectorKind, "rsem-bank-prompt-union-ranking");
assert(exposure.log.selectedUnitCount > 0);
assert(exposure.log.selectedUnitCount < exposure.log.orderedUnitCount);

// Probe order is not a weight. All 12 prompts are unioned equally, so reversing
// the bank must not change the ordered selector plan or exposure prefix.
const reversed = assembleELRSemBankStaticExposure({
  config: halfConfig,
  probePrompts: [...prompts].reverse(),
  namingSchemeId: namingScheme.schemeId,
  repositoryFiles: repository,
});
assert.strictEqual(reversed.log.selectorPlanHash, exposure.log.selectorPlanHash);
assert.strictEqual(reversed.log.exposureSetHash, exposure.log.exposureSetHash);
assert.strictEqual(reversed.log.staticPayloadHash, exposure.log.staticPayloadHash);

// Explicit leakage regression: mutate every forbidden probe-side field while
// preserving only the worker-visible prompt strings passed to the selector.
const poisonedFixture = booleanBank.map((probe) => ({
  ...probe,
  correctAnswer: probe.correctAnswer === true ? false : true,
  derivedFrom: {
    candidateSource: "POISONED-CANDIDATE-SOURCE",
    counterexampleState: { POISONED: "POISONED" },
    matchedInvariantId: "POISONED",
  },
}));
const poisonedPromptOnlyExposure = assembleELRSemBankStaticExposure({
  config: halfConfig,
  probePrompts: poisonedFixture.map((probe) => probe.prompt),
  namingSchemeId: namingScheme.schemeId,
  repositoryFiles: repository,
});
assert.strictEqual(poisonedPromptOnlyExposure.log.selectorPlanHash, exposure.log.selectorPlanHash);
assert.strictEqual(poisonedPromptOnlyExposure.log.exposureSetHash, exposure.log.exposureSetHash);
const provenanceJson = JSON.stringify(poisonedPromptOnlyExposure.log);
for (const forbidden of [
  "correctAnswer",
  "candidateSource",
  "counterexampleState",
  "POISONED-CANDIDATE-SOURCE",
]) {
  assert(!provenanceJson.includes(forbidden), `Rsem selector provenance must not contain ${forbidden}`);
}

const zero = assembleELRSemBankStaticExposure({
  config: makeConfig(0),
  probePrompts: prompts,
  namingSchemeId: namingScheme.schemeId,
  repositoryFiles: repository,
});
assert.deepStrictEqual(zero.contextFiles, {});
assert.strictEqual(zero.log.actualExposedTokens, 0);

const full = assembleELRSemBankStaticExposure({
  config: makeConfig(fullTokens),
  probePrompts: prompts,
  namingSchemeId: namingScheme.schemeId,
  repositoryFiles: repository,
});
assert.deepStrictEqual(full.contextFiles, repository);
assert.strictEqual(full.log.actualExposedTokens, fullTokens);

console.log(JSON.stringify({
  status: "ok",
  probeCount: prompts.length,
  unionEntities,
  fullRepositoryTokens: fullTokens,
  halfExposureTokens: exposure.log.actualExposedTokens,
  selectedUnits: exposure.log.selectedUnitCount,
  selectorPlanHash: exposure.log.selectorPlanHash,
}, null, 2));

function makeConfig(contextBudget: number): RunConfig {
  return {
    experimentId: "verify-el-rsem-static-exposure",
    lineageId: "lineage-0",
    runClass: "smoke",
    backend: "mock-noop",
    condition: "EL",
    contextBudget,
    staticExposureMaxTokensPerUnit: 256,
    generations: 1,
    tasks: ["T-crosscut-1"],
    syntheticWorldDir,
    runsDir: path.join(repoRoot, "runs", "_smoke"),
  };
}

function loadRepositoryFiles(repositoryDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  walk(repositoryDir, repositoryDir, result);
  return result;
}

function walk(
  baseDir: string,
  currentDir: string,
  result: Record<string, string>
): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walk(baseDir, absolute, result);
    } else if (entry.isFile()) {
      result[path.relative(baseDir, absolute).replace(/\\/g, "/")] =
        fs.readFileSync(absolute, "utf8");
    }
  }
}
