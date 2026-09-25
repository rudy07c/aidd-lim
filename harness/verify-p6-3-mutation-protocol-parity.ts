import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  OPENAI_MUTATION_SCHEMA_VERSION,
  OPENAI_PROMPT_HASH,
  OPENAI_PROMPT_VERSION,
  OPENAI_SCHEMA_HASH,
  buildOpenAIUserMessage,
  parseStructuredMutation,
} from "./src/agent-backend/openai/shared";
import {
  P6_1_FAILURE_CLASSIFICATION_VERSION,
  classifyFailure,
} from "./src/p6/failure-classification";
import {
  P6_3_EXECUTION_PROTOCOL_VERSION,
  P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
} from "./src/p6/p6-3-execution-protocol";
import {
  P6_3_MUTATION_FAILURE_CLASSIFICATION_BEHAVIOR_VERSION,
  P6_3_MUTATION_PARSER_BEHAVIOR_VERSION,
  P6_3_MUTATION_PATH_VALIDATION_VERSION,
  P6_3_MUTATION_PROTOCOL_PARITY_VERSION,
  P6_3_MUTATION_PROVIDER_CONTRACT,
  validateP63MutationPathsP62Compatible,
} from "./src/p6/p6-3-mutation-protocol-parity";

const repoRoot = path.resolve(__dirname, "..");
const evidenceRepoPath = "docs/findings/evidence/p6-2-af-baseline/result.json";
const frozenManifestRepoPath = "harness/frozen/p6-3-mutation-protocol-parity.json";
const expectedEvidenceSha256 =
  "b7b0e3f9598b034548b8466258a0aae54916fcdfa2ef0f53f9f85636272c7801";
const expectedP62SourceGitSha = "0a0fd1a262c2e4274f1b946562c9b4e79f6fb71b";
const expectedP62HistoricalCodeFingerprint =
  "2e81f255fc6149e5699335e67a582172e146acdda0a3deeac893c3600d46fe5b";

const evidenceRaw = fs.readFileSync(path.join(repoRoot, evidenceRepoPath));
assert.equal(sha256(evidenceRaw), expectedEvidenceSha256, "P6-2 AF evidence changed");
const evidence = JSON.parse(evidenceRaw.toString("utf8"));
const p62 = evidence.executionManifest;
assert.equal(p62.gitSha, expectedP62SourceGitSha);
assert.equal(p62.codeFingerprintSha256, expectedP62HistoricalCodeFingerprint);

assert.equal(OPENAI_PROMPT_VERSION, p62.mutationPromptVersion);
assert.equal(OPENAI_PROMPT_HASH, p62.mutationPromptHash);
assert.equal(OPENAI_MUTATION_SCHEMA_VERSION, p62.mutationSchemaVersion);
assert.equal(OPENAI_SCHEMA_HASH, p62.mutationSchemaHash);
assert.equal(P6_1_FAILURE_CLASSIFICATION_VERSION, p62.failureClassificationVersion);

assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.model, p62.model);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.reasoningEffort, p62.reasoningEffort);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens, p62.maxOutputTokens);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs, p62.requestTimeoutMs);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.providerMaxRetries, p62.maxRetries);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.serviceTier, p62.serviceTier);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.promptCacheMode, p62.promptCacheMode);

const p62RunnerSource = fs.readFileSync(
  path.join(repoRoot, "harness/p6-af-baseline-live.ts"),
  "utf8"
);
assert.match(p62RunnerSource, /storeResponses:\s*false/);
assert.match(p62RunnerSource, /maxToolRounds:\s*0/);

const protocolRows = evidence.measurements.M.repeatResults.filter(
  (row: any) => row.failureDomain === "protocol"
);
const duplicateRows = protocolRows.filter(
  (row: any) => row.failureCategory === "output-parse" &&
    /^Duplicate modified file path: /.test(row.failureReason ?? "")
);
const mutationValidationRows = protocolRows.filter(
  (row: any) => row.failureCategory === "mutation-validation"
);
assert.equal(duplicateRows.length, 18, "historical P6-2 duplicate-path anchor changed");
assert.equal(mutationValidationRows.length, 1, "historical P6-2 mutation-validation anchor changed");
assert.equal(
  mutationValidationRows[0].failureReason,
  "write-outside-repository-contract:workingNote"
);

const userMessageFixture = buildOpenAIUserMessage({
  contextFiles: {
    "src/z.ts": "export const z = 2;",
    "src/a.ts": "export const a = 1;",
  },
  visibleInstruction: "P6-3 mutation protocol parity fixture",
  contextBudget: "full",
});

const parserCases = [
  parserCase("valid", JSON.stringify({
    modifiedFiles: [{ path: "src/a.ts", content: "export const a = 2;" }],
    workingNote: "updated a",
  })),
  parserCase("invalid-json", "{"),
  parserCase("schema-mismatch", JSON.stringify({ modifiedFiles: [] })),
  parserCase("working-note-too-long", JSON.stringify({
    modifiedFiles: [],
    workingNote: "x".repeat(601),
  })),
  parserCase("duplicate-path", JSON.stringify({
    modifiedFiles: [
      { path: "src/a.ts", content: "one" },
      { path: "src/a.ts", content: "two" },
    ],
    workingNote: "duplicate",
  })),
  parserCase("invalid-item", JSON.stringify({
    modifiedFiles: [{ path: "src/a.ts", content: 42 }],
    workingNote: "bad item",
  })),
];

const pathValidationCases = [
  pathCase("src-path", { "src/a.ts": "x" }),
  pathCase("tests-path", { "tests/a.test.ts": "x" }),
  pathCase("windows-separator-normalization", { "src\\a.ts": "x" }),
  pathCase("absolute-path", { "/tmp/a.ts": "x" }),
  pathCase("parent-escape", { "../a.ts": "x" }),
  pathCase("bare-parent", { "..": "x" }),
  pathCase("outside-contract", { "workingNote": "x" }),
  pathCase("package-json", { "package.json": "{}" }),
];

const failureClassificationCases = [
  failureCase("pass", { passed: true }),
  failureCase("semantic", {
    passed: false,
    validity: "valid",
    failureCategory: "test-failure",
    failureReason: "hidden:rule mismatch",
    executionStatus: "ok",
  }),
  failureCase("system", {
    passed: false,
    validity: "valid",
    failureCategory: "test-failure",
    failureReason: "hidden:execution:compiler crashed",
    executionStatus: "ok",
  }),
  failureCase("output-parse-protocol", {
    passed: false,
    validity: "valid",
    failureCategory: "output-parse",
    failureReason: "Duplicate modified file path: src/a.ts",
    executionStatus: "output-parse-failure",
  }),
  failureCase("mutation-validation-protocol", {
    passed: false,
    validity: "valid",
    failureCategory: "mutation-validation",
    failureReason: "write-outside-repository-contract:workingNote",
    executionStatus: "mutation-validation-failure",
  }),
  failureCase("provider-infrastructure", {
    passed: false,
    validity: "infrastructure-invalid",
    failureCategory: "provider",
    failureReason: "429",
    executionStatus: "provider-error",
  }),
  failureCase("harness-infrastructure", {
    passed: false,
    validity: "infrastructure-invalid",
    failureCategory: "harness",
    failureReason: "runner failure",
    executionStatus: "ok",
  }),
  failureCase("other", {
    passed: false,
    validity: "valid",
    failureCategory: "unexpected",
    failureReason: "unknown",
    executionStatus: "ok",
  }),
];

const currentParitySourcePaths = [
  "harness/src/agent-backend/openai/shared.ts",
  "harness/src/p6/failure-classification.ts",
  "harness/src/run-validity.ts",
  "harness/p6-af-baseline-live.ts",
  "harness/src/p6/p6-3-execution-protocol.ts",
  "harness/src/p6/p6-3-mutation-protocol-parity.ts",
] as const;

const expectedManifest = {
  schemaVersion: "p6-3-mutation-protocol-parity-manifest-v1",
  status: "frozen-pass",
  parityVersion: P6_3_MUTATION_PROTOCOL_PARITY_VERSION,
  p62HistoricalEvidence: {
    path: evidenceRepoPath,
    sha256: expectedEvidenceSha256,
    sourceGitSha: expectedP62SourceGitSha,
    codeFingerprintSha256: expectedP62HistoricalCodeFingerprint,
    criticalSourceFiles: p62.criticalSourceFiles,
    observedProtocolAnchors: {
      duplicatePathOutputParseFailures: duplicateRows.length,
      mutationValidationFailures: mutationValidationRows.length,
      mutationValidationFailureReason: mutationValidationRows[0].failureReason,
    },
  },
  mutationPrompt: {
    version: OPENAI_PROMPT_VERSION,
    hash: OPENAI_PROMPT_HASH,
    userMessageFixtureSha256: sha256(userMessageFixture),
  },
  mutationSchema: {
    version: OPENAI_MUTATION_SCHEMA_VERSION,
    hash: OPENAI_SCHEMA_HASH,
  },
  providerContract: P6_3_MUTATION_PROVIDER_CONTRACT,
  parser: {
    behaviorVersion: P6_3_MUTATION_PARSER_BEHAVIOR_VERSION,
    cases: parserCases,
    behaviorSha256: sha256(stableJson(parserCases)),
  },
  pathValidation: {
    behaviorVersion: P6_3_MUTATION_PATH_VALIDATION_VERSION,
    cases: pathValidationCases,
    behaviorSha256: sha256(stableJson(pathValidationCases)),
  },
  failureClassification: {
    version: P6_1_FAILURE_CLASSIFICATION_VERSION,
    behaviorVersion: P6_3_MUTATION_FAILURE_CLASSIFICATION_BEHAVIOR_VERSION,
    cases: failureClassificationCases,
    behaviorSha256: sha256(stableJson(failureClassificationCases)),
  },
  scientificReplacement: {
    executionProtocolVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
    maxScientificAttemptsPerLogicalCell: P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
    infrastructureInvalidOnly: true,
    immediateSameCellRetry: true,
    note: "provider SDK maxRetries=2 is distinct from P6-3 scientific-cell replacement maxAttempts=3",
  },
  currentParitySurfaceSha256: Object.fromEntries(
    currentParitySourcePaths.map((relativePath) => [relativePath, sha256File(relativePath)])
  ),
};

const output = `${JSON.stringify(expectedManifest, null, 2)}\n`;
console.log(output.trimEnd());
const outputPath = process.env.P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT;
if (outputPath) {
  const absolute = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, output, "utf8");
}

const committedPath = path.join(repoRoot, frozenManifestRepoPath);
assert(fs.existsSync(committedPath), `missing committed parity manifest: ${frozenManifestRepoPath}`);
const committed = JSON.parse(fs.readFileSync(committedPath, "utf8"));
assert.deepStrictEqual(
  committed,
  expectedManifest,
  "P6-3 mutation protocol parity drifted from committed manifest"
);

console.log(JSON.stringify({
  status: "ok",
  parityVersion: P6_3_MUTATION_PROTOCOL_PARITY_VERSION,
  parserCases: parserCases.length,
  pathValidationCases: pathValidationCases.length,
  failureClassificationCases: failureClassificationCases.length,
}, null, 2));

function parserCase(id: string, raw: string): { id: string; outcome: string } {
  const parsed = parseStructuredMutation(raw);
  if (parsed.ok) return { id, outcome: "ok" };
  const error = parsed.error;
  if (error.startsWith("Invalid structured JSON:")) return { id, outcome: "invalid-json" };
  if (error === "Structured output does not match repository_mutation_v2") {
    return { id, outcome: "schema-mismatch" };
  }
  if (error.startsWith("workingNote exceeds ")) return { id, outcome: "working-note-too-long" };
  if (error.startsWith("Duplicate modified file path: ")) return { id, outcome: "duplicate-path" };
  if (error === "modifiedFiles item must contain string path/content") {
    return { id, outcome: "invalid-item" };
  }
  return { id, outcome: `unexpected:${error}` };
}

function pathCase(
  id: string,
  files: Record<string, string>
): { id: string; outcome: string } {
  return { id, outcome: validateP63MutationPathsP62Compatible(files) ?? "ok" };
}

function failureCase(
  id: string,
  value: Parameters<typeof classifyFailure>[0]
): { id: string; outcome: string } {
  return { id, outcome: classifyFailure(value).failureDomain };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(relativePath: string): string {
  return sha256(fs.readFileSync(path.join(repoRoot, relativePath)));
}
