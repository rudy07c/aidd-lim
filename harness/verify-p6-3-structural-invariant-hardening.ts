import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type {
  GroundTruth,
  GroundTruthDelta,
  Invariant,
  NamingScheme,
} from "../synthetic-world/schema";
import { buildOpenAIUserMessage } from "./src/agent-backend/openai/shared";
import {
  assembleELTaskStaticExposure,
  type ELTaskDescriptor,
} from "./src/context/el-static-exposure-runtime";
import {
  assembleELRSemBankStaticExposure,
  derivePromptUnionEntityIds,
} from "./src/context/el-rsem-static-exposure-runtime";
import { buildPrivilegedRetrievalPlan } from "./src/context/privileged-retrieval-controller";
import {
  contextFilesFromOrderedUnits,
  countStaticRepositoryPayloadTokens,
  serializeStaticRepositoryPayload,
  type StaticExposureOrderedUnit,
  type StaticExposurePrefixResult,
} from "./src/context/static-exposure";
import { chunkArtifactFile } from "./src/measurement/artifact-unit";
import type { RunConfig } from "./src/types";

interface HeldOutTask extends ELTaskDescriptor {
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

const STATIC_EXPOSURE_MAX_TOKENS_PER_UNIT = 256;
const RSEM_NAMING_SCHEME_ID = "A-obfuscated";

const repoRoot = path.resolve(__dirname, "..");
const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
const repository = loadRepositoryFiles(path.join(syntheticWorldDir, "repository"));
const fullPayload = serializeStaticRepositoryPayload(repository);
const fullTokens = countStaticRepositoryPayloadTokens(repository);

const tasks = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")
) as HeldOutTask[];
const probes = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "calibration/fixtures/probe-bank-stage1.json"), "utf8")
) as ProbeFixture[];
const groundTruth = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8")
) as GroundTruth;
const namingSchemes = JSON.parse(
  fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8")
) as NamingScheme[];

const budgetSpecs = [
  { label: "B0", tokens: 0 },
  { label: "B1", tokens: Math.floor(fullTokens / 8) },
  { label: "B2", tokens: Math.floor(fullTokens / 4) },
  { label: "B3", tokens: Math.floor(fullTokens / 2) },
  { label: "B4", tokens: Math.floor((3 * fullTokens) / 4) },
  { label: "AF", tokens: fullTokens },
] as const;

assert(fullTokens > 0, "P6-3 structural hardening requires non-empty repository payload");
verifyAFSerializerParity();

const verifiedPlans: string[] = [];

for (const taskId of PRIMARY_M_TASK_IDS) {
  const task = tasks.find((candidate) => candidate.taskId === taskId);
  assert(task, `${taskId}: missing heldout task`);
  assert(task.groundTruthDelta, `${taskId}: missing GroundTruthDelta`);
  assert(task.namingScheme, `${taskId}: missing namingScheme`);

  const namingScheme = requireNamingScheme(task.namingScheme);
  const orderedUnits = buildTaskOrderedUnits(task, namingScheme);
  const buildExposure = (budgetTokens: number): StaticExposurePrefixResult =>
    assembleELTaskStaticExposure({
      config: makeConfig(budgetTokens, taskId),
      task,
      repositoryFiles: repository,
    });

  verifyPlan(taskId, orderedUnits, buildExposure);
  verifiedPlans.push(taskId);
}

const booleanProbes = probes.filter((probe) => probe.type === "boolean");
assert.strictEqual(booleanProbes.length, 12, "Rsem bank must contain exactly 12 boolean probes");
assert(
  booleanProbes.every((probe) => probe.namingScheme === RSEM_NAMING_SCHEME_ID),
  `Rsem boolean probes must all use ${RSEM_NAMING_SCHEME_ID}`
);

const rsemPrompts = booleanProbes.map((probe) => probe.prompt);
const rsemNamingScheme = requireNamingScheme(RSEM_NAMING_SCHEME_ID);
const rsemOrderedUnits = buildRsemOrderedUnits(rsemPrompts, rsemNamingScheme);
const buildRsemExposure = (budgetTokens: number): StaticExposurePrefixResult =>
  assembleELRSemBankStaticExposure({
    config: makeConfig(budgetTokens, "__p6_3_rsem_bank__"),
    probePrompts: rsemPrompts,
    namingSchemeId: RSEM_NAMING_SCHEME_ID,
    repositoryFiles: repository,
  });

verifyPlan("Rsem-bank-12", rsemOrderedUnits, buildRsemExposure);
verifiedPlans.push("Rsem-bank-12");

assert.strictEqual(verifiedPlans.length, 12, "expected 11 M plans plus one Rsem bank plan");

console.log(
  JSON.stringify(
    {
      status: "ok",
      verifier: "p6-3-structural-invariant-hardening-v1",
      planCount: verifiedPlans.length,
      plans: verifiedPlans,
      fullRepositoryTokens: fullTokens,
      maxTokensPerUnit: STATIC_EXPOSURE_MAX_TOKENS_PER_UNIT,
      verifiedInvariants: [
        "whole-unit-prefix",
        "first-non-fitting-stops-prefix",
        "no-skip-in",
        "nested-prefixes",
        "unit-boundary-token-count-nondecreasing",
        "full-prefix-byte-parity",
        "af-current-repository-framing-parity",
        "deterministic-selector-exposure-payload-hashes",
      ],
    },
    null,
    2
  )
);

function verifyPlan(
  planId: string,
  orderedUnits: readonly StaticExposureOrderedUnit[],
  buildExposure: (budgetTokens: number) => StaticExposurePrefixResult
): void {
  assert(orderedUnits.length > 0, `${planId}: ordered plan must not be empty`);

  const expectedOrderedIds = orderedUnits.map((entry) => entry.unit.id);
  const exposures = budgetSpecs.map(({ tokens }) => buildExposure(tokens));
  const repeatedExposures = budgetSpecs.map(({ tokens }) => buildExposure(tokens));

  for (let index = 0; index < exposures.length; index += 1) {
    const spec = budgetSpecs[index];
    const exposure = exposures[index];
    const repeated = repeatedExposures[index];

    assert.deepStrictEqual(
      exposure.orderedUnitIds,
      expectedOrderedIds,
      `${planId}/${spec.label}: runtime ordered plan must match independently rebuilt plan`
    );
    assert.deepStrictEqual(
      exposure.selectedUnitIds,
      expectedOrderedIds.slice(0, exposure.selectedUnitIds.length),
      `${planId}/${spec.label}: selected units must be an exact whole-unit prefix with no skip-in`
    );
    assert.strictEqual(
      exposure.log.actualExposedTokens,
      countStaticRepositoryPayloadTokens(exposure.contextFiles),
      `${planId}/${spec.label}: logged actual tokens must equal exact model-visible static payload`
    );
    assert(
      exposure.log.actualExposedTokens <= spec.tokens,
      `${planId}/${spec.label}: actual exposure exceeds nominal budget`
    );

    if (exposure.selectedUnitIds.length < orderedUnits.length) {
      const nextPrefix = orderedUnits.slice(0, exposure.selectedUnitIds.length + 1);
      const nextTokens = countStaticRepositoryPayloadTokens(
        contextFilesFromOrderedUnits(nextPrefix)
      );
      assert(
        nextTokens > spec.tokens,
        `${planId}/${spec.label}: first non-selected unit still fits; prefix is not maximal`
      );
    }

    assert.strictEqual(
      repeated.log.selectorPlanHash,
      exposure.log.selectorPlanHash,
      `${planId}/${spec.label}: selector-plan hash is not deterministic`
    );
    assert.strictEqual(
      repeated.log.exposureSetHash,
      exposure.log.exposureSetHash,
      `${planId}/${spec.label}: exposure-set hash is not deterministic`
    );
    assert.strictEqual(
      repeated.log.staticPayloadHash,
      exposure.log.staticPayloadHash,
      `${planId}/${spec.label}: static-payload hash is not deterministic`
    );
  }

  for (let index = 1; index < exposures.length; index += 1) {
    assert.deepStrictEqual(
      exposures[index].selectedUnitIds.slice(0, exposures[index - 1].selectedUnitIds.length),
      exposures[index - 1].selectedUnitIds,
      `${planId}: larger budget must preserve smaller-budget unit prefix`
    );
  }

  let previousPrefixTokens = 0;
  for (let prefixLength = 1; prefixLength <= orderedUnits.length; prefixLength += 1) {
    const prefixTokens = countStaticRepositoryPayloadTokens(
      contextFilesFromOrderedUnits(orderedUnits.slice(0, prefixLength))
    );
    assert(
      prefixTokens >= previousPrefixTokens,
      `${planId}: static payload token count decreases at unit boundary ${prefixLength - 1}->${prefixLength}`
    );
    previousPrefixTokens = prefixTokens;
  }

  assert.strictEqual(
    previousPrefixTokens,
    fullTokens,
    `${planId}: complete ordered-unit prefix must have canonical token count T_EL`
  );

  const fullExposure = exposures[exposures.length - 1];
  assert.strictEqual(
    fullExposure.selectedUnitIds.length,
    expectedOrderedIds.length,
    `${planId}: B=T_EL must select every ordered unit`
  );
  assert.strictEqual(
    serializeStaticRepositoryPayload(fullExposure.contextFiles),
    fullPayload,
    `${planId}: B=T_EL must reconstruct the complete repository byte-for-byte`
  );
}

function buildTaskOrderedUnits(
  task: HeldOutTask,
  namingScheme: NamingScheme
): StaticExposureOrderedUnit[] {
  assert(task.groundTruthDelta);
  const ranking = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    repositoryFiles: repository,
  });
  return orderedUnitsFromRanking(ranking.entries);
}

function buildRsemOrderedUnits(
  probePrompts: readonly string[],
  namingScheme: NamingScheme
): StaticExposureOrderedUnit[] {
  const seedEntities = derivePromptUnionEntityIds(probePrompts, groundTruth, namingScheme);
  assert(seedEntities.length > 0, "Rsem selector must derive at least one prompt-union entity");

  const addInvariants: Invariant[] = seedEntities.map((entityId) => {
    const entity = groundTruth.entities.find((candidate) => candidate.id === entityId);
    assert(entity, `Rsem selector seed references unknown entity ${entityId}`);
    return {
      id: `__p6_3_rsem_selector_seed__${entityId}`,
      description: "P6-3 selector-only self seed; never model-visible",
      encoding: "explicit",
      condition: { entity: entityId, state: entity.initialState },
      requires: { entity: entityId, state: entity.initialState },
    };
  });

  const ranking = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: { addInvariants },
    namingScheme,
    repositoryFiles: repository,
  });
  return orderedUnitsFromRanking(ranking.entries);
}

function orderedUnitsFromRanking(
  entries: readonly {
    sequence: number;
    path: string;
    category: StaticExposureOrderedUnit["category"];
    mappedEntities: string[];
    semanticRelevant: boolean;
    dependencyDistance: number | null;
  }[]
): StaticExposureOrderedUnit[] {
  const orderedUnits: StaticExposureOrderedUnit[] = [];
  for (const entry of entries) {
    const content = repository[entry.path];
    assert.notStrictEqual(content, undefined, `ranking path missing from repository: ${entry.path}`);
    const chunks = chunkArtifactFile(
      entry.path,
      content!,
      STATIC_EXPOSURE_MAX_TOKENS_PER_UNIT
    );
    for (const unit of chunks) {
      orderedUnits.push({
        unit,
        selectorSequence: entry.sequence,
        category: entry.category,
        mappedEntities: [...entry.mappedEntities],
        semanticRelevant: entry.semanticRelevant,
        dependencyDistance: entry.dependencyDistance,
      });
    }
  }
  return orderedUnits;
}

function verifyAFSerializerParity(): void {
  const visibleInstruction = "p6-3 structural invariant AF framing parity";
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
  assert.strictEqual(
    afPrompt,
    expectedPrompt,
    "P6-3 static serializer must remain byte-identical to AF CURRENT REPOSITORY framing"
  );
}

function requireNamingScheme(schemeId: string): NamingScheme {
  const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === schemeId);
  assert(namingScheme, `missing naming scheme ${schemeId}`);
  return namingScheme;
}

function makeConfig(contextBudget: number, taskId: string): RunConfig {
  return {
    experimentId: "p6-3-structural-invariant-hardening",
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
