import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  assertStage1ProbeBankValid,
  generateStage1Probes,
  STAGE1_BOOLEAN_DESIGN_VERSION,
} from "../calibration/src/stage1-probes";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import type { GroundTruth, NamingScheme } from "../synthetic-world/schema";
import {
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_EXECUTION_PROTOCOL_VERSION,
  P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
} from "./src/p6/p6-3-execution-protocol";
import {
  P6_3_RSEM_DESIGN_VERSION,
  P6_3_RSEM_FAILURE_SEMANTICS,
  P6_3_RSEM_FAILURE_SEMANTICS_VERSION,
  P6_3_RSEM_OUTPUT_INSTRUCTIONS,
  P6_3_RSEM_PARSER_BEHAVIOR_VERSION,
  P6_3_RSEM_PROMPT_VERSION,
  P6_3_RSEM_PROTOCOL_PARITY_VERSION,
  P6_3_RSEM_PROVIDER_CONTRACT,
  P6_3_RSEM_SCHEMA_VERSION,
  buildP63RSemPromptP62Compatible,
  buildP63RSemSchemaP62Compatible,
  parseP63RSemCompletedResponseP62Compatible,
} from "./src/p6/p6-3-rsem-protocol-parity";

const EVIDENCE_REPO_PATH = "docs/findings/evidence/p6-2-af-baseline/result.json";
const FROZEN_MANIFEST_REPO_PATH = "harness/frozen/p6-3-rsem-protocol-parity.json";
const EXPECTED_EVIDENCE_SHA256 = "b7b0e3f9598b034548b8466258a0aae54916fcdfa2ef0f53f9f85636272c7801";
const EXPECTED_SOURCE_GIT_SHA = "0a0fd1a262c2e4274f1b946562c9b4e79f6fb71b";
const EXPECTED_CRITICAL_SOURCE_FINGERPRINT = "2e81f255fc6149e5699335e67a582172e146acdda0a3deeac893c3600d46fe5b";
const EXPECTED_PROBE_IDS = Array.from({ length: 12 }, (_, index) =>
  `A-obfuscated-bool-r${String(index + 1).padStart(2, "0")}`
);
const EXPECTED_PROMPT_TEMPLATE_HASH = "312f981ea8568b01f3fb8731bde65e7c316f489df6f72b396c010b058a3a4e31";
const EXPECTED_SCHEMA_HASH = "728e0fcb0b89c1488ac18c1a8f21d280566af5a81a77a083c8e273761e299561";
const EXPECTED_BOOLEAN_BANK_HASH = "b073a252611bb0d12d2273a75366a464f7edc2f3faf5ae5e73668b33e62c6f32";

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortJson((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function loadBooleanProbes(repoRoot: string): {
  probes: GeneratedProbe[];
  groundTruthRaw: string;
  namingSchemesRaw: string;
} {
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const groundTruthRaw = fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8");
  const namingSchemesRaw = fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8");
  const groundTruth = JSON.parse(groundTruthRaw) as GroundTruth;
  const schemes = JSON.parse(namingSchemesRaw) as NamingScheme[];
  const scheme = schemes.find((candidate) => candidate.schemeId === "A-obfuscated");
  assert(scheme, "missing A-obfuscated naming scheme");
  const probes = generateStage1Probes(
    groundTruth,
    scheme,
    path.join(syntheticWorldDir, "repository/tests/rules.visible.test.ts")
  );
  const audit = assertStage1ProbeBankValid(probes);
  assert.equal(audit.booleanTotal, 12);
  assert.equal(audit.booleanTrue, 6);
  assert.equal(audit.booleanFalse, 6);
  return {
    probes: probes.filter((probe) => probe.type === "boolean"),
    groundTruthRaw,
    namingSchemesRaw,
  };
}

function promptTemplateHash(): string {
  return sha256(
    `${P6_3_RSEM_PROMPT_VERSION}\nREPOSITORY FILES:<full AF repository>\nQUESTIONS:<opaque boolean probe IDs + neutral relation prompts>\n` +
    "instruction:answer semantic probes from supplied repository evidence; forced-choice true/false"
  );
}

function correctAnswerPayload(probes: readonly GeneratedProbe[], render: (value: boolean) => unknown): string {
  return JSON.stringify(Object.fromEntries(
    probes.map((probe) => [probe.probeId, render(Boolean(probe.correctAnswer))])
  ));
}

function parserBehavior(probes: readonly GeneratedProbe[]) {
  const cases = [
    {
      id: "exact-true-false",
      result: parseP63RSemCompletedResponseP62Compatible(
        correctAnswerPayload(probes, (value) => String(value)),
        probes
      ),
    },
    {
      id: "yes-no-alias",
      result: parseP63RSemCompletedResponseP62Compatible(
        correctAnswerPayload(probes, (value) => value ? "yes" : "no"),
        probes
      ),
    },
    {
      id: "numeric-alias",
      result: parseP63RSemCompletedResponseP62Compatible(
        correctAnswerPayload(probes, (value) => value ? "1" : "0"),
        probes
      ),
    },
    {
      id: "japanese-alias",
      result: parseP63RSemCompletedResponseP62Compatible(
        correctAnswerPayload(probes, (value) => value ? "はい" : "いいえ"),
        probes
      ),
    },
    {
      id: "json-boolean-coercion",
      result: parseP63RSemCompletedResponseP62Compatible(
        correctAnswerPayload(probes, (value) => value),
        probes
      ),
    },
    {
      id: "invalid-json",
      result: parseP63RSemCompletedResponseP62Compatible("{not-json", probes),
    },
    {
      id: "missing-answer",
      result: parseP63RSemCompletedResponseP62Compatible(
        JSON.stringify(Object.fromEntries(
          probes.slice(1).map((probe) => [probe.probeId, String(Boolean(probe.correctAnswer))])
        )),
        probes
      ),
    },
    {
      id: "malformed-forced-choice",
      result: parseP63RSemCompletedResponseP62Compatible(
        JSON.stringify(Object.fromEntries(
          probes.map((probe, index) => [
            probe.probeId,
            index === 0 ? "maybe" : String(Boolean(probe.correctAnswer)),
          ])
        )),
        probes
      ),
    },
  ];

  for (const entry of cases.slice(0, 5)) {
    assert.equal(entry.result.outcome, "ok", entry.id);
    assert.equal(entry.result.protocolValid, true, entry.id);
    assert.equal(entry.result.booleanCorrect, probes.length, entry.id);
  }
  assert.equal(cases[5].result.outcome, "output-parse-failure");
  assert.equal(cases[5].result.protocolValid, false);
  assert.equal(cases[6].result.outcome, "answer-protocol-failure");
  assert.equal(cases[6].result.protocolValid, false);
  assert.equal(cases[7].result.outcome, "answer-protocol-failure");
  assert.equal(cases[7].result.protocolValid, false);

  return cases.map(({ id, result }) => ({
    id,
    outcome: result.outcome,
    protocolValid: result.protocolValid,
    booleanCorrect: result.booleanCorrect,
    booleanTotal: result.booleanTotal,
    failureReasonPrefix: result.failureReason?.split(":")[0] ?? null,
  }));
}

function sourceHashes(repoRoot: string): Record<string, string> {
  const files = [
    "harness/p6-af-baseline-live.ts",
    "harness/src/agent-backend/openai/shared.ts",
    "harness/src/context/el-rsem-static-exposure-runtime.ts",
    "harness/src/p6/p6-3-execution-protocol.ts",
    "harness/src/p6/p6-3-rsem-protocol-parity.ts",
    "calibration/src/stage1-probes.ts",
    "calibration/src/probe-scorer.ts",
  ];
  return Object.fromEntries(files.map((relativePath) => [
    relativePath,
    sha256(fs.readFileSync(path.join(repoRoot, relativePath))),
  ]));
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const evidenceRaw = fs.readFileSync(path.join(repoRoot, EVIDENCE_REPO_PATH));
  assert.equal(sha256(evidenceRaw), EXPECTED_EVIDENCE_SHA256, "P6-2 AF evidence changed");
  const evidence = JSON.parse(evidenceRaw.toString("utf8"));
  const historical = evidence.executionManifest;

  assert.equal(historical.gitSha, EXPECTED_SOURCE_GIT_SHA);
  assert.equal(historical.codeFingerprintSha256, EXPECTED_CRITICAL_SOURCE_FINGERPRINT);
  assert.equal(historical.probeDesignVersion, P6_3_RSEM_DESIGN_VERSION);
  assert.equal(historical.probePromptVersion, P6_3_RSEM_PROMPT_VERSION);
  assert.equal(historical.probePromptTemplateHash, EXPECTED_PROMPT_TEMPLATE_HASH);
  assert.equal(historical.probeSchemaVersion, P6_3_RSEM_SCHEMA_VERSION);
  assert.equal(historical.probeSchemaHash, EXPECTED_SCHEMA_HASH);
  assert.equal(historical.booleanProbeBankSha256, EXPECTED_BOOLEAN_BANK_HASH);
  assert.deepEqual(evidence.measurements.Rsem.booleanProbeIds, EXPECTED_PROBE_IDS);
  assert.equal(STAGE1_BOOLEAN_DESIGN_VERSION, P6_3_RSEM_DESIGN_VERSION);

  const { probes, groundTruthRaw, namingSchemesRaw } = loadBooleanProbes(repoRoot);
  assert.deepEqual(probes.map((probe) => probe.probeId), EXPECTED_PROBE_IDS);
  assert.equal(sha256(stableJson(probes)), EXPECTED_BOOLEAN_BANK_HASH);
  assert.equal(sha256(groundTruthRaw), historical.groundTruthSha256);
  assert.equal(sha256(namingSchemesRaw), historical.namingSchemesSha256);

  const schema = buildP63RSemSchemaP62Compatible(probes);
  assert.equal(sha256(stableJson(schema)), EXPECTED_SCHEMA_HASH);
  assert.equal(promptTemplateHash(), EXPECTED_PROMPT_TEMPLATE_HASH);

  const contextFixture = {
    "z.ts": "export const z = 2;\n",
    "a.ts": "export const a = 1;\n",
  };
  const prompt = buildP63RSemPromptP62Compatible(contextFixture, probes);
  assert(prompt.indexOf("--- a.ts ---") < prompt.indexOf("--- z.ts ---"), "Rsem repository framing must sort paths");

  const poisoned = JSON.parse(JSON.stringify(probes)) as GeneratedProbe[];
  for (const probe of poisoned as any[]) {
    probe.correctAnswer = !Boolean(probe.correctAnswer);
    probe.derivedFrom = {
      ...(probe.derivedFrom ?? {}),
      candidateSource: "POISONED-CANDIDATE-SOURCE",
      matchedInvariantId: "POISONED-INVARIANT",
      reachableCounterexample: { poisoned: true },
    };
  }
  assert.equal(
    buildP63RSemPromptP62Compatible(contextFixture, poisoned),
    prompt,
    "Rsem prompt must be invariant to correct-answer/provenance poisoning"
  );
  assert.deepEqual(
    buildP63RSemSchemaP62Compatible(poisoned),
    schema,
    "Rsem schema must be invariant to correct-answer/provenance poisoning"
  );

  const parserCases = parserBehavior(probes);
  const failureSemantics = [...P6_3_RSEM_FAILURE_SEMANTICS].map((entry) => ({ ...entry }));

  assert.deepEqual(P6_3_RSEM_PROVIDER_CONTRACT, {
    model: historical.model,
    reasoningEffort: historical.reasoningEffort,
    maxOutputTokens: historical.probeMaxOutputTokens,
    requestTimeoutMs: historical.requestTimeoutMs,
    providerMaxRetries: historical.maxRetries,
    serviceTier: historical.serviceTier,
    promptCacheMode: historical.promptCacheMode,
    storeResponses: false,
    executionMode: "sync",
  });

  const expectedManifest = {
    schemaVersion: "p6-3-rsem-protocol-parity-manifest-v1",
    status: "frozen-pass",
    parityVersion: P6_3_RSEM_PROTOCOL_PARITY_VERSION,
    p62HistoricalEvidence: {
      path: EVIDENCE_REPO_PATH,
      sha256: EXPECTED_EVIDENCE_SHA256,
      sourceGitSha: historical.gitSha,
      codeFingerprintSha256: historical.codeFingerprintSha256,
      runnerSha256: historical.runnerSha256,
    },
    probeBank: {
      designVersion: historical.probeDesignVersion,
      booleanProbeCount: probes.length,
      booleanProbeIds: probes.map((probe) => probe.probeId),
      booleanProbeBankSha256: historical.booleanProbeBankSha256,
      groundTruthSha256: historical.groundTruthSha256,
      namingSchemesSha256: historical.namingSchemesSha256,
      constantAnswerBaseline: evidence.measurements.Rsem.constantAnswerBaseline,
    },
    prompt: {
      version: historical.probePromptVersion,
      templateHash: historical.probePromptTemplateHash,
      outputInstructions: P6_3_RSEM_OUTPUT_INSTRUCTIONS,
      contextFixtureSha256: sha256(prompt),
      answerAndProvenancePoisoningInvariant: true,
    },
    schema: {
      version: historical.probeSchemaVersion,
      hash: historical.probeSchemaHash,
      answerType: "string",
      additionalProperties: false,
      answerAndProvenancePoisoningInvariant: true,
    },
    providerContract: P6_3_RSEM_PROVIDER_CONTRACT,
    parser: {
      behaviorVersion: P6_3_RSEM_PARSER_BEHAVIOR_VERSION,
      cases: parserCases,
      behaviorSha256: sha256(stableJson(parserCases)),
    },
    failureSemantics: {
      version: P6_3_RSEM_FAILURE_SEMANTICS_VERSION,
      cases: failureSemantics,
      behaviorSha256: sha256(stableJson(failureSemantics)),
    },
    historicalOutcomeAnchor: {
      repeatCount: evidence.measurements.Rsem.repeatResults.length,
      protocolValidRepeats: evidence.measurements.Rsem.protocolValidRepeats,
      protocolFailureRepeats: evidence.measurements.Rsem.protocolFailureRepeats,
      protocolReliability: evidence.measurements.Rsem.protocolReliability,
      booleanCorrect: evidence.measurements.Rsem.repeatResults.reduce(
        (sum: number, row: any) => sum + row.booleanCorrect,
        0
      ),
      booleanTotal: evidence.measurements.Rsem.repeatResults.reduce(
        (sum: number, row: any) => sum + row.booleanTotal,
        0
      ),
      note: "historical outcome only; never used to alter P6-3 prompt/schema/parser semantics",
    },
    scientificReplacement: {
      executionProtocolVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
      calibrationRepeatCount: P6_3_CALIBRATION_REPEAT_COUNT,
      maxScientificAttemptsPerLogicalCell: P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
      infrastructureInvalidOnly: true,
      immediateSameCellRetry: true,
    },
    currentParitySurfaceSha256: sourceHashes(repoRoot),
  };

  const outputPath = process.env.P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT;
  if (outputPath) {
    const resolved = path.resolve(__dirname, outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(expectedManifest, null, 2) + "\n", "utf8");
  }

  const committed = JSON.parse(
    fs.readFileSync(path.join(repoRoot, FROZEN_MANIFEST_REPO_PATH), "utf8")
  );
  assert.deepStrictEqual(committed, expectedManifest, "committed P6-3 Rsem parity manifest differs from recomputed contract");

  console.log(JSON.stringify({
    status: "ok",
    parityVersion: P6_3_RSEM_PROTOCOL_PARITY_VERSION,
    probeCount: probes.length,
    promptTemplateHash: EXPECTED_PROMPT_TEMPLATE_HASH,
    schemaHash: EXPECTED_SCHEMA_HASH,
    booleanProbeBankSha256: EXPECTED_BOOLEAN_BANK_HASH,
    parserBehaviorSha256: expectedManifest.parser.behaviorSha256,
    failureSemanticsSha256: expectedManifest.failureSemantics.behaviorSha256,
  }, null, 2));
}

main();
