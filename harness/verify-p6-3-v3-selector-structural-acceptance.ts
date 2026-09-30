import assert from "assert";
import * as fs from "fs";
import * as path from "path";
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
  PRIVILEGED_RETRIEVAL_POLICY_VERSION,
  type PrivilegedRetrievalPlan,
  type PrivilegedRetrievalPlanEntry,
} from "./src/context/privileged-retrieval-controller";
import {
  buildStaticExposurePrefix,
  countStaticRepositoryPayloadTokens,
} from "./src/context/static-exposure";
import {
  chooseStructurallyAcceptedNextCategory,
  P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER,
  P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC,
  P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
} from "./src/context/p6-3-v3-selector-structural-acceptance";

const CATEGORIES = P6_3_V3_SELECTOR_ACCEPTED_CATEGORY_ORDER;
const selectorSourcePath = path.join(
  __dirname,
  "src",
  "context",
  "blended-static-exposure-selector.ts"
);
const selectorSource = fs.readFileSync(selectorSourcePath, "utf8");

interface FixtureEntry {
  path: string;
  category: ArtifactFileCategory;
  semanticRelevant?: boolean;
  dependencyDistance?: number | null;
}

interface Fixture {
  name: string;
  repositoryFiles: Record<string, string>;
  entries: FixtureEntry[];
  maxTokensPerUnit: number;
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

function makePlan(entries: FixtureEntry[]): PrivilegedRetrievalPlan {
  const planEntries: PrivilegedRetrievalPlanEntry[] = entries.map((entry, sequence) => ({
    sequence,
    path: entry.path,
    category: entry.category,
    mappedEntities: [],
    semanticRelevant: entry.semanticRelevant ?? false,
    dependencyDistance: entry.dependencyDistance ?? null,
  }));
  return {
    policyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    surfaceEntities: [],
    semanticEntities: [],
    entityFilePaths: {},
    dependencyDistances: {},
    entries: planEntries,
  };
}

/** Independent executable oracle derived only from the frozen acceptance spec. */
function buildReferenceOrder(fixture: Fixture): Array<{
  unit: ArtifactUnit;
  category: ArtifactFileCategory;
  entry: PrivilegedRetrievalPlanEntry;
}> {
  const ranking = makePlan(fixture.entries);
  const queues = emptyQueues();
  const full = emptyNumbers();
  const seen = new Set<string>();

  for (const entry of ranking.entries) {
    assert(!seen.has(entry.path), `fixture ${fixture.name} contains duplicate ranking path`);
    seen.add(entry.path);
    const content = fixture.repositoryFiles[entry.path];
    assert.notEqual(content, undefined, `fixture ${fixture.name} missing ${entry.path}`);
    full[entry.category] += countCanonicalTokens(content);
    for (const unit of chunkArtifactFile(entry.path, content, fixture.maxTokensPerUnit)) {
      queues[entry.category].push({
        entry,
        unit,
        contentTokens: Math.max(1, countCanonicalTokens(unit.content)),
      });
    }
  }
  assert.deepEqual(
    [...seen].sort(),
    Object.keys(fixture.repositoryFiles).sort(),
    `fixture ${fixture.name} ranking must cover repository exactly once`
  );

  const served = emptyNumbers();
  const ordered: Array<{
    unit: ArtifactUnit;
    category: ArtifactFileCategory;
    entry: PrivilegedRetrievalPlanEntry;
  }> = [];

  while (CATEGORIES.some((category) => queues[category].length > 0)) {
    const nextTokens: Record<ArtifactFileCategory, number | null> = {
      type_definition: queues.type_definition[0]?.contentTokens ?? null,
      fixed_contract: queues.fixed_contract[0]?.contentTokens ?? null,
      test: queues.test[0]?.contentTokens ?? null,
      implementation: queues.implementation[0]?.contentTokens ?? null,
    };
    const available = CATEGORIES.filter((category) => queues[category].length > 0);
    const category = chooseStructurallyAcceptedNextCategory({
      availableCategories: available,
      servedContentTokens: served,
      fullContentTokens: full,
      nextContentTokens: nextTokens,
    });
    const pending = queues[category].shift();
    assert(pending);
    served[category] += pending.contentTokens;
    ordered.push({ unit: pending.unit, category, entry: pending.entry });
  }
  return ordered;
}

function assertSourceBoundary(): void {
  const imports = [...selectorSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
  const allowedImports = [
    "../measurement/artifact-unit",
    "../measurement/file-classification",
    "../measurement/token-counter",
    "./privileged-retrieval-controller",
    "./static-exposure",
  ];
  assert.deepEqual([...new Set(imports)].sort(), allowedImports.sort());

  assert(selectorSource.includes("ranking: PrivilegedRetrievalPlan"));
  assert(selectorSource.includes("repositoryFiles: Readonly<Record<string, string>>"));
  assert(selectorSource.includes("maxTokensPerUnit: number"));

  const forbiddenImportFragments = [
    "fixed-environment",
    "live-calibration",
    "rsem",
    "evaluator",
    "provider",
    "result-summary",
  ];
  for (const fragment of forbiddenImportFragments) {
    assert(
      !imports.some((source) => source.toLowerCase().includes(fragment)),
      `selector imports prohibited dependency fragment: ${fragment}`
    );
  }
}

function assertFixture(fixture: Fixture): void {
  const ranking = makePlan(fixture.entries);
  const production = buildCategoryProportionalBlendedOrder({
    ranking,
    repositoryFiles: fixture.repositoryFiles,
    maxTokensPerUnit: fixture.maxTokensPerUnit,
  });
  const repeated = buildCategoryProportionalBlendedOrder({
    ranking,
    repositoryFiles: fixture.repositoryFiles,
    maxTokensPerUnit: fixture.maxTokensPerUnit,
  });
  const reference = buildReferenceOrder(fixture);

  assert.equal(production.policyVersion, BLENDED_STATIC_EXPOSURE_POLICY_VERSION);
  assert.deepEqual(production, repeated, `${fixture.name}: selector must be deterministic`);
  assert.deepEqual(
    production.orderedUnits.map((ordered) => [ordered.unit.id, ordered.category]),
    reference.map((ordered) => [ordered.unit.id, ordered.category]),
    `${fixture.name}: production selector must match exact acceptance scheduler`
  );

  const productionIds = production.orderedUnits.map((ordered) => ordered.unit.id);
  assert.equal(new Set(productionIds).size, productionIds.length, `${fixture.name}: duplicate unit`);
  assert.deepEqual(
    [...productionIds].sort(),
    reference.map((ordered) => ordered.unit.id).sort(),
    `${fixture.name}: complete repository unit coverage must be exact`
  );

  // Within each category, the frozen input ranking and each file's chunk order
  // must remain unchanged by cross-category interleaving.
  for (const category of CATEGORIES) {
    assert.deepEqual(
      production.orderedUnits
        .filter((ordered) => ordered.category === category)
        .map((ordered) => ordered.unit.id),
      reference
        .filter((ordered) => ordered.category === category)
        .map((ordered) => ordered.unit.id),
      `${fixture.name}: within-category order drift for ${category}`
    );
  }

  // Repository object insertion order is not a treatment input.
  const reversedRepository = Object.fromEntries(
    Object.entries(fixture.repositoryFiles).reverse()
  );
  const insertionOrderVariant = buildCategoryProportionalBlendedOrder({
    ranking,
    repositoryFiles: reversedRepository,
    maxTokensPerUnit: fixture.maxTokensPerUnit,
  });
  assert.deepEqual(
    insertionOrderVariant.orderedUnits,
    production.orderedUnits,
    `${fixture.name}: repository object insertion order changed selection`
  );

  // B_expose is a prefix of one frozen order, so increasing budgets may only add
  // artifact units; they may never replace or reorder previously exposed units.
  const fullBudget = countStaticRepositoryPayloadTokens(fixture.repositoryFiles);
  const budgets = [...new Set([
    0,
    Math.floor(fullBudget / 4),
    Math.floor(fullBudget / 2),
    Math.floor((3 * fullBudget) / 4),
    fullBudget,
    fullBudget + fixture.maxTokensPerUnit,
  ])].sort((a, b) => a - b);
  let prior: string[] = [];
  for (const budgetTokens of budgets) {
    const exposure = buildStaticExposurePrefix({
      orderedUnits: production.orderedUnits,
      fullRepositoryFiles: fixture.repositoryFiles,
      budgetTokens,
      maxTokensPerUnit: fixture.maxTokensPerUnit,
      artifactChunkerVersion: "p6-3-v3-selector-acceptance-fixture-v1",
      selectorKind: "EL-static",
      selectorId: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
      rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
      selectorSurfaceEntities: [],
      selectorSemanticEntities: [],
    });
    assert.deepEqual(
      exposure.selectedUnitIds.slice(0, prior.length),
      prior,
      `${fixture.name}: exposure lost nested-prefix property at budget ${budgetTokens}`
    );
    prior = exposure.selectedUnitIds;
  }
}

const fixtures: Fixture[] = [
  {
    name: "balanced-tie-break",
    maxTokensPerUnit: 128,
    repositoryFiles: {
      "src/types.ts": "export type A = { value: number };\n",
      "src/protocol.ts": "export interface P { run(x: number): number }\n",
      "tests/rules.visible.test.ts": "export const visibleExpectation = 1;\n",
      "src/core.ts": "export function run(x: number) { return x + 1; }\n",
    },
    entries: [
      { path: "src/types.ts", category: "type_definition" },
      { path: "src/protocol.ts", category: "fixed_contract" },
      { path: "tests/rules.visible.test.ts", category: "test" },
      { path: "src/core.ts", category: "implementation", semanticRelevant: true, dependencyDistance: 0 },
    ],
  },
  {
    name: "asymmetric-multichunk",
    maxTokensPerUnit: 72,
    repositoryFiles: {
      "src/types-a.ts": "export type A = string;\nexport type B = number;\n",
      "src/protocol-a.ts": "export interface A { a(x: string): string }\n".repeat(4),
      "src/protocol-b.ts": "export interface B { b(x: number): number }\n".repeat(2),
      "tests/a.visible.test.ts": "export const testA = true;\n".repeat(8),
      "src/impl-a.ts": "export function a(x: string) { return x.trim(); }\n".repeat(10),
      "src/impl-b.ts": "export function b(x: number) { return x * 2; }\n".repeat(6),
    },
    entries: [
      { path: "src/types-a.ts", category: "type_definition" },
      { path: "src/protocol-a.ts", category: "fixed_contract" },
      { path: "src/protocol-b.ts", category: "fixed_contract" },
      { path: "tests/a.visible.test.ts", category: "test" },
      { path: "src/impl-a.ts", category: "implementation", semanticRelevant: true, dependencyDistance: 0 },
      { path: "src/impl-b.ts", category: "implementation", semanticRelevant: false, dependencyDistance: 2 },
    ],
  },
  {
    name: "sparse-categories",
    maxTokensPerUnit: 96,
    repositoryFiles: {
      "tests/only.visible.test.ts": "export const testOnly = true;\n".repeat(3),
      "src/only-impl.ts": "export const implementationOnly = 42;\n".repeat(5),
    },
    entries: [
      { path: "tests/only.visible.test.ts", category: "test" },
      { path: "src/only-impl.ts", category: "implementation", semanticRelevant: true, dependencyDistance: 1 },
    ],
  },
];

assert.equal(P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC.decisionBasis, "artifact-structure-only");
assert.equal(P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC.liveAuthorization, false);
assert.equal(
  P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC.fixedEnvironmentTreatment,
  "outside-selector-outside-B_expose"
);
assertSourceBoundary();
for (const fixture of fixtures) assertFixture(fixture);

console.log(JSON.stringify({
  status: "ok",
  acceptanceSpecVersion: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
  evaluatedSelectorVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
  decisionBasis: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC.decisionBasis,
  liveAuthorization: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC.liveAuthorization,
  fixtureCount: fixtures.length,
  verified: [
    "exact-projected-normalized-load-scheduler-parity",
    "determinism",
    "complete-unit-coverage-exactly-once",
    "nested-prefix-exposure",
    "within-category-ranking-and-chunk-order-preservation",
    "repository-object-insertion-order-invariance",
    "scientific-outcome-dependency-exclusion",
    "fixed-environment-dependency-exclusion",
    "canonical-token-counting-in-normative-scheduler",
  ],
  note: "This verifier freezes the structural acceptance rule only. It does not promote the prototype selector, freeze the v3 budget grid, or authorize live/provider execution.",
}, null, 2));
