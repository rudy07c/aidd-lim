import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { GroundTruthDelta } from "../synthetic-world/schema";
import {
  assembleELTaskStaticExposure,
  EL_ARTIFACT_CHUNKER_VERSION,
  EL_TASK_SELECTOR_VERSION,
} from "./src/context/el-static-exposure-runtime";
import {
  assembleELRSemBankStaticExposure,
  EL_RSEM_BANK_SELECTOR_VERSION,
} from "./src/context/el-rsem-static-exposure-runtime";
import { PRIVILEGED_RETRIEVAL_POLICY_VERSION } from "./src/context/privileged-retrieval-controller";
import {
  countStaticRepositoryPayloadTokens,
  serializeStaticRepositoryPayload,
  STATIC_EXPOSURE_SCHEMA_VERSION,
  STATIC_EXPOSURE_UNIT_MAPPING_VERSION,
  STATIC_REPOSITORY_SERIALIZER_VERSION,
  type StaticExposurePrefixResult,
} from "./src/context/static-exposure";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  CANONICAL_TOKEN_ENCODING,
} from "./src/measurement/token-counter";
import type { RunConfig } from "./src/types";

interface HeldOutTask {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

interface ProbeFixture {
  probeId: string;
  type: string;
  namingScheme: string;
  prompt: string;
}

interface ExposureSummary {
  label: string;
  nominal: number;
  actual: number;
  selectedUnitCount: number;
  selectorPlanHash: string;
  exposureSetHash: string;
  staticPayloadHash: string;
  selectedFilePaths: string[];
  selectedUnitIds: string[];
  categoryUnitCounts: Record<string, number>;
  categoryStaticPayloadTokens: Record<string, number>;
}

interface PlanSummary {
  planId: string;
  kind: "M" | "Rsem";
  exposures: ExposureSummary[];
}

const PRIMARY_M_TASK_IDS = [
  "T-local-2",
  "T-crosscut-1",
  "T-delayed-1",
  "T-local-3",
  "T-local-4",
  "T-local-5",
  "T-local-6",
  "T-local-7",
  "T-crosscut-3",
  "T-crosscut-4",
  "T-delayed-2",
] as const;

// Scientific structural candidate predeclared before this verifier was added.
const STATIC_EXPOSURE_MAX_TOKENS_PER_UNIT = 256;
const RSEM_NAMING_SCHEME_ID = "A-obfuscated";
const CANDIDATE_SCHEMA_VERSION = "p6-3-el-structural-freeze-candidate-v3" as const;

const repoRoot = path.resolve(__dirname, "..");
const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
const repository = loadRepositoryFiles(path.join(syntheticWorldDir, "repository"));
const tasks = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")
) as HeldOutTask[];
const probes = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "calibration/fixtures/probe-bank-stage1.json"), "utf8")
) as ProbeFixture[];
const packageLock = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "harness/package-lock.json"), "utf8")
) as { packages?: Record<string, { version?: string }> };

const fullTokens = countStaticRepositoryPayloadTokens(repository);
if (!Number.isInteger(fullTokens) || fullTokens <= 0) {
  throw new Error(`Invalid T_EL: ${fullTokens}`);
}

const budgetSpecs = [
  { label: "B0", tokens: 0 },
  { label: "B1", tokens: Math.floor(fullTokens / 8) },
  { label: "B2", tokens: Math.floor(fullTokens / 4) },
  { label: "B3", tokens: Math.floor(fullTokens / 2) },
  { label: "B4", tokens: Math.floor((3 * fullTokens) / 4) },
  { label: "AF", tokens: fullTokens },
] as const;

const failures: string[] = [];
const plans: PlanSummary[] = [];

for (const taskId of PRIMARY_M_TASK_IDS) {
  const task = tasks.find((candidate) => candidate.taskId === taskId);
  if (!task) {
    failures.push(`${taskId}: missing from heldout_tasks.json`);
    continue;
  }
  if (!task.groundTruthDelta) {
    failures.push(`${taskId}: missing GroundTruthDelta`);
    continue;
  }
  if (!task.namingScheme) {
    failures.push(`${taskId}: missing namingScheme`);
    continue;
  }

  const exposures = budgetSpecs.map(({ label, tokens }) => {
    const result = assembleELTaskStaticExposure({
      config: makeConfig(tokens, taskId),
      task,
      repositoryFiles: repository,
    });
    return summarizeExposure(label, result);
  });
  validatePlan(taskId, exposures, failures);
  plans.push({ planId: taskId, kind: "M", exposures });
}

const booleanProbes = probes.filter((probe) => probe.type === "boolean");
if (booleanProbes.length !== 12) {
  failures.push(`Rsem: expected 12 boolean probes, found ${booleanProbes.length}`);
} else {
  const namingSchemes = new Set(booleanProbes.map((probe) => probe.namingScheme));
  if (namingSchemes.size !== 1 || !namingSchemes.has(RSEM_NAMING_SCHEME_ID)) {
    failures.push(
      `Rsem: expected all boolean probes to use ${RSEM_NAMING_SCHEME_ID}, found ${[
        ...namingSchemes,
      ].join(",")}`
    );
  } else {
    const prompts = booleanProbes.map((probe) => probe.prompt);
    const exposures = budgetSpecs.map(({ label, tokens }) => {
      const result = assembleELRSemBankStaticExposure({
        config: makeConfig(tokens, "__p6_3_rsem_bank__"),
        probePrompts: prompts,
        namingSchemeId: RSEM_NAMING_SCHEME_ID,
        repositoryFiles: repository,
      });
      return summarizeExposure(label, result);
    });
    validatePlan("Rsem-bank-12", exposures, failures);
    plans.push({ planId: "Rsem-bank-12", kind: "Rsem", exposures });
  }
}

if (plans.length !== PRIMARY_M_TASK_IDS.length + 1) {
  failures.push(
    `expected ${PRIMARY_M_TASK_IDS.length + 1} structural plans, produced ${plans.length}`
  );
}

const jsTiktokenVersion = packageLock.packages?.["node_modules/js-tiktoken"]?.version;
if (!jsTiktokenVersion) {
  failures.push("could not resolve installed js-tiktoken version from harness/package-lock.json");
}

const scientificSourcePaths = [
  "harness/src/context/static-exposure.ts",
  "harness/src/context/el-static-exposure-runtime.ts",
  "harness/src/context/el-rsem-static-exposure-runtime.ts",
  "harness/src/context/privileged-retrieval-controller.ts",
  "harness/src/measurement/artifact-unit.ts",
  "harness/src/measurement/file-classification.ts",
  "harness/src/measurement/token-counter.ts",
  "synthetic-world/schema.ts",
  "synthetic-world/semantic_locality.ts",
] as const;
const scientificInputPaths = [
  "synthetic-world/ground_truth.json",
  "synthetic-world/naming_schemes.json",
  "synthetic-world/heldout_tasks.json",
  "calibration/fixtures/probe-bank-stage1.json",
  "harness/package-lock.json",
] as const;

const freezeCandidate = {
  staticExposureMaxTokensPerUnit: STATIC_EXPOSURE_MAX_TOKENS_PER_UNIT,
  T_EL: fullTokens,
  budgets: Object.fromEntries(budgetSpecs.map(({ label, tokens }) => [label, tokens])),
  primaryMTaskIds: PRIMARY_M_TASK_IDS,
  rsem: {
    namingSchemeId: RSEM_NAMING_SCHEME_ID,
    booleanProbeCount: booleanProbes.length,
    probeIds: booleanProbes.map((probe) => probe.probeId),
  },
  tokenizer: {
    encoding: CANONICAL_TOKEN_ENCODING,
    countMethod: CANONICAL_TOKEN_COUNT_METHOD,
    jsTiktokenVersion: jsTiktokenVersion ?? null,
  },
  versions: {
    staticExposureSchema: STATIC_EXPOSURE_SCHEMA_VERSION,
    staticRepositorySerializer: STATIC_REPOSITORY_SERIALIZER_VERSION,
    artifactUnitMapping: STATIC_EXPOSURE_UNIT_MAPPING_VERSION,
    artifactChunker: EL_ARTIFACT_CHUNKER_VERSION,
    privilegedRankingPolicy: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    taskSelector: EL_TASK_SELECTOR_VERSION,
    rsemSelector: EL_RSEM_BANK_SELECTOR_VERSION,
  },
};

const fingerprints = {
  repositoryPayloadSha256: sha256(serializeStaticRepositoryPayload(repository)),
  scientificSources: Object.fromEntries(
    scientificSourcePaths.map((relativePath) => [relativePath, sha256File(relativePath)])
  ),
  scientificInputs: Object.fromEntries(
    scientificInputPaths.map((relativePath) => [relativePath, sha256File(relativePath)])
  ),
};

const freezeBody = {
  schemaVersion: CANDIDATE_SCHEMA_VERSION,
  status: failures.length === 0 ? "pass" : "needs-design-audit",
  freezeCandidate,
  fingerprints,
  planCount: plans.length,
  plans: plans.map((plan) => ({
    planId: plan.planId,
    kind: plan.kind,
    selectorPlanHash: plan.exposures[0]?.selectorPlanHash ?? null,
    exposures: plan.exposures,
  })),
  failures,
};

const output = {
  ...freezeBody,
  candidateFingerprintSha256: sha256(stableStringify(freezeBody)),
};
const outputJson = `${JSON.stringify(output, null, 2)}\n`;

console.log(outputJson.trimEnd());
const candidateOutputPath = process.env.P6_3_FREEZE_CANDIDATE_OUTPUT;
if (candidateOutputPath) {
  const absoluteOutputPath = path.resolve(process.cwd(), candidateOutputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, outputJson, "utf8");
}
if (failures.length > 0) process.exitCode = 1;

function summarizeExposure(
  label: string,
  result: StaticExposurePrefixResult
): ExposureSummary {
  return {
    label,
    nominal: result.log.budgetTokens,
    actual: result.log.actualExposedTokens,
    selectedUnitCount: result.log.selectedUnitCount,
    selectorPlanHash: result.log.selectorPlanHash,
    exposureSetHash: result.log.exposureSetHash,
    staticPayloadHash: result.log.staticPayloadHash,
    selectedFilePaths: [...result.log.selectedFilePaths],
    selectedUnitIds: [...result.selectedUnitIds],
    categoryUnitCounts: { ...result.log.categoryUnitCounts },
    categoryStaticPayloadTokens: { ...result.log.categoryStaticPayloadTokens },
  };
}

function validatePlan(
  planId: string,
  exposures: ExposureSummary[],
  target: string[]
): void {
  if (exposures.length !== budgetSpecs.length) {
    target.push(`${planId}: expected ${budgetSpecs.length} exposures, got ${exposures.length}`);
    return;
  }

  const [b0, b1, b2, b3, b4, af] = exposures;

  if (b0.actual !== 0 || b0.selectedUnitCount !== 0 || b0.selectedUnitIds.length !== 0) {
    target.push(`${planId}: B0 must expose exactly zero artifact tokens/units`);
  }
  if (af.actual !== fullTokens) {
    target.push(`${planId}: AF actual ${af.actual} must equal T_EL ${fullTokens}`);
  }

  const actuals = [b0.actual, b1.actual, b2.actual, b3.actual, b4.actual, af.actual];
  for (let i = 1; i < actuals.length; i++) {
    if (!(actuals[i - 1] < actuals[i])) {
      target.push(
        `${planId}: strict token ordering failed at ${exposures[i - 1].label}->${exposures[i].label} (${actuals[i - 1]} !< ${actuals[i]})`
      );
    }
  }

  for (const exposure of exposures) {
    if (exposure.actual > exposure.nominal) {
      target.push(
        `${planId}: ${exposure.label} actual ${exposure.actual} exceeds nominal ${exposure.nominal}`
      );
    }
  }

  const finiteHashes = [b1, b2, b3, b4].map((exposure) => exposure.exposureSetHash);
  if (new Set(finiteHashes).size !== finiteHashes.length) {
    target.push(`${planId}: finite exposure-set hashes are not all distinct`);
  }

  const planHashes = new Set(exposures.map((exposure) => exposure.selectorPlanHash));
  if (planHashes.size !== 1) {
    target.push(`${planId}: selector plan hash changes across budgets`);
  }

  for (let i = 1; i < exposures.length; i++) {
    const previous = exposures[i - 1].selectedUnitIds;
    const current = exposures[i].selectedUnitIds;
    const prefix = current.slice(0, previous.length);
    if (!arraysEqual(previous, prefix)) {
      target.push(
        `${planId}: ${exposures[i].label} does not preserve ${exposures[i - 1].label} as an exact unit prefix`
      );
    }
  }
}

function makeConfig(contextBudget: number, taskId: string): RunConfig {
  return {
    experimentId: "p6-3-el-structural-freeze",
    lineageId: "lineage-0",
    runClass: "smoke",
    backend: "mock-noop",
    condition: "EL",
    contextBudget,
    staticExposureMaxTokensPerUnit: STATIC_EXPOSURE_MAX_TOKENS_PER_UNIT,
    generations: 1,
    tasks: [taskId],
    syntheticWorldDir,
    runsDir: path.join(repoRoot, "runs", "_smoke"),
  };
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(relativePath: string): string {
  return sha256(fs.readFileSync(path.join(repoRoot, relativePath)));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = sortForStableJson((value as Record<string, unknown>)[key]);
  }
  return result;
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
