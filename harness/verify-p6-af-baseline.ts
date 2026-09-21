import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  STAGE1_BOOLEAN_DESIGN_VERSION,
  assertStage1ProbeBankValid,
  generateStage1Probes,
} from "../calibration/src/stage1-probes";
import type { GroundTruth, NamingScheme } from "../synthetic-world/schema";
import {
  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_EQUIVALENCE_ALPHA,
  P6_2_EQUIVALENCE_CI_LEVEL,
  P6_2_EQUIVALENCE_DESIGN_VERSION,
  P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,
  P6_2_MAX_SCIENTIFIC_REPEATS,
  P6_2_MIN_SCIENTIFIC_REPEATS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
  P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
  P6_2_VARIANCE_SD_UCB_CONFIDENCE,
  p62VariancePilotArmOrder,
  resolveP62RepeatCountSource,
  classifyP62MRepeat,
  p62MOutcomeDisposition,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
} from "./src/p6/af-baseline";
import { exactPairedTostPowerAtZero, findMinimumExactPairedTostN } from "./src/p6/equivalence-power";
import { applyP62Adjudication } from "./src/p6/adjudication";
import {
  assertP62ResumeCompatible,
  buildP62ExecutionManifest,
  commitProbeResultAtomic,
  createP62Result,
  mJournalDirectory,
  reconcileProbeJournal,
  requiresP62MAudit,
  requiresP62RSemAudit,
  assertP62LiveRepeatCountFrozen,
  runRSemRepeat,
  type P62AfBaselineResult,
  type P62ProbeClientFactory,
  type RSemProbeRepeatResult,
} from "./p6-af-baseline-live";
import { getPackageVersion } from "./src/agent-backend/openai/shared";
import {
  commitRepeatArtifactsAtomic,
  reconcileRepeatJournal,
  type RepeatArtifactBundle,
} from "./src/p6/task-bank-live-runtime";

interface HeldOutTask {
  taskId: string;
  type?: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

function loadRepository(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadRepository(full, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function hashRepository(files: Record<string, string>): string {
  const hash = crypto.createHash("sha256");
  for (const filePath of Object.keys(files).sort()) {
    hash.update(filePath);
    hash.update("\0");
    hash.update(files[filePath]);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertThrowsMessage(fn: () => void, pattern: RegExp): void {
  let thrown: unknown = null;
  try { fn(); } catch (error) { thrown = error; }
  assert(thrown instanceof Error, `Expected error matching ${pattern}`);
  assert.match(thrown.message, pattern);
}

function mockUsage() {
  return {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
}

function completedProbeResponse(outputText: string) {
  return {
    id: "resp_mock",
    status: "completed",
    model: "gpt-5.6-luna-mock",
    output_text: outputText,
    output: [],
    usage: mockUsage(),
    service_tier: "default",
  };
}

function fakeProbeFactory(
  outcome: any | Error,
  captured?: Array<{ timeout: number; maxRetries: number }>
): P62ProbeClientFactory {
  return (options) => {
    captured?.push(options);
    return {
      responses: {
        create: async () => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      },
    };
  };
}

async function main(): Promise<void> {
  // Equivalence semantics are frozen independently of any live AF outcome.
  assert.equal(P6_2_EQUIVALENCE_DESIGN_VERSION, "p6-2-equivalence-v1");
  assert.equal(P6_2_DELTA_M, 1 / 12);
  assert.equal(P6_2_DELTA_R, 1 / 12);
  assert.equal(P6_2_EQUIVALENCE_ALPHA, 0.05);
  assert.equal(P6_2_EQUIVALENCE_CI_LEVEL, 0.90);
  assert.equal(P6_2_EQUIVALENCE_TARGET_POWER, 0.80);
  assert.equal(P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS, 8);
  assert.equal(P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR, 3);
  assert.deepEqual(p62VariancePilotArmOrder(1), ["A", "B"]);
  assert.deepEqual(p62VariancePilotArmOrder(2), ["B", "A"]);
  assert.equal(resolveP62RepeatCountSource(8), "runtime-argument-pre-freeze");
  assert.equal(resolveP62RepeatCountSource(11, 11), "frozen-scientific-repeat-count");
  assertThrowsMessage(() => resolveP62RepeatCountSource(10, 11), /does not match frozen scientific repeat count/);
  assert.equal(P6_2_VARIANCE_SD_UCB_CONFIDENCE, 0.95);
  assert.equal(P6_2_MIN_SCIENTIFIC_REPEATS, 8);
  assert.equal(P6_2_MAX_SCIENTIFIC_REPEATS, 30);
  assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, null);
  assert.equal(p62MOutcomeDisposition("semantic"), "score");
  assert.equal(p62MOutcomeDisposition("protocol"), "score");
  assert.equal(p62MOutcomeDisposition("system"), "needs-audit");
  assert.equal(p62MOutcomeDisposition("infrastructure"), "needs-audit");
  assert.equal(p62MOutcomeDisposition("other"), "needs-audit");
  assert.equal(requiresP62MAudit("protocol"), false);
  assert.equal(requiresP62MAudit("system"), true);
  assert.equal(requiresP62MAudit("infrastructure"), true);
  assert.equal(requiresP62MAudit("other"), true);
  assert.equal(requiresP62RSemAudit("protocol"), true);
  assert.equal(requiresP62RSemAudit("system"), true);
  assert.equal(requiresP62RSemAudit("infrastructure"), true);
  assertThrowsMessage(() => assertP62LiveRepeatCountFrozen(8), /scientific repeat count is not frozen/);

  // Exact paired-TOST power regression: sigma_U=Delta must not use the old normal approximation.
  const sigmaEqualsDeltaPower9 = exactPairedTostPowerAtZero({ n: 9, sigma: P6_2_DELTA_M, delta: P6_2_DELTA_M, alpha: 0.05 });
  assert(Math.abs(sigmaEqualsDeltaPower9 - 0.7246881164476543) < 1e-6, `unexpected n=9 exact power: ${sigmaEqualsDeltaPower9}`);
  const exactSearch = findMinimumExactPairedTostN({
    sigmaUpperBound: P6_2_DELTA_M, delta: P6_2_DELTA_M, targetPower: 0.80, alpha: 0.05, minN: 8, maxN: 30,
  });
  assert.equal(exactSearch.requiredN, 11);
  assert((exactSearch.powers.find((x) => x.n === 10)?.power ?? 1) < 0.80);
  assert((exactSearch.powers.find((x) => x.n === 11)?.power ?? 0) >= 0.80);

  const repoRoot = path.resolve(__dirname, "..");
  const swDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(swDir, "repository");
  const taskBankPath = path.join(swDir, "heldout_tasks.json");
  const taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const tasks = JSON.parse(taskBankRaw) as HeldOutTask[];
  const repository: Record<string, string> = {};
  loadRepository(repositoryDir, repositoryDir, repository);

  // Frozen P6-1b classifications are reused as-is: 12 primary + 2 eligible diagnostic; floor 6 excluded.
  assert.equal(P6_2_TASK_BANK_VERSION, "p6-1-full-task-bank-v3-postflight-coverage");
  const selection = selectP62TaskBank(tasks);
  assert.deepEqual(selection.primary.map((task) => task.taskId), [...P6_2_PRIMARY_TASK_IDS]);
  assert.deepEqual(selection.diagnostic.map((task) => task.taskId), [...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS]);
  assert.deepEqual(selection.excludedSemanticFloorTaskIds, [...P6_2_SEMANTIC_FLOOR_TASK_IDS]);
  assert.equal(selection.primary.length, 12);
  assert.equal(selection.diagnostic.length, 2);
  assert.equal(selection.measured.length, 14);
  for (const floorId of P6_2_SEMANTIC_FLOOR_TASK_IDS) {
    assert(!selection.measured.some((task) => task.taskId === floorId), `${floorId} leaked into P6-2 measured tasks`);
  }
  const oneRepeatPlan = planP62MRepeats(selection, 1);
  assert.equal(oneRepeatPlan.length, 14);
  assert.equal(oneRepeatPlan.filter((item) => item.role === "primary").length, 12);
  assert.equal(oneRepeatPlan.filter((item) => item.role === "diagnostic").length, 2);
  assert.deepEqual(planP62ProbeRepeats(1), [1]);

  // R^sem path uses the validated stage1-neutral-relation-v2 boolean bank, independently of M.
  const groundTruthRaw = fs.readFileSync(path.join(swDir, "ground_truth.json"), "utf8");
  const namingSchemesRaw = fs.readFileSync(path.join(swDir, "naming_schemes.json"), "utf8");
  const groundTruth = JSON.parse(groundTruthRaw) as GroundTruth;
  const schemes = JSON.parse(namingSchemesRaw) as NamingScheme[];
  const scheme = schemes.find((candidate) => candidate.schemeId === "A-obfuscated");
  assert(scheme, "A-obfuscated naming scheme missing");
  const probes = generateStage1Probes(groundTruth, scheme, path.join(repositoryDir, "tests/rules.visible.test.ts"));
  const audit = assertStage1ProbeBankValid(probes);
  const booleanProbes = probes.filter((probe) => probe.type === "boolean");
  assert.equal(STAGE1_BOOLEAN_DESIGN_VERSION, "stage1-neutral-relation-v2");
  assert.equal(audit.booleanTotal, 12);
  assert.equal(audit.booleanTrue, 6);
  assert.equal(audit.booleanFalse, 6);
  assert.equal(audit.alwaysTrueAccuracy, 0.5);
  assert.equal(audit.alwaysFalseAccuracy, 0.5);

  const probeSchema = {
    type: "object",
    properties: Object.fromEntries(booleanProbes.map((probe) => [probe.probeId, { type: "string" }])),
    required: booleanProbes.map((probe) => probe.probeId),
    additionalProperties: false,
  };
  const probeMaterial = {
    groundTruthRaw,
    namingSchemesRaw,
    booleanProbes,
    probeBankSha256: hashText(stableJson(booleanProbes)),
    probeSchemaHash: hashText(stableJson(probeSchema)),
  };

  // Manifest includes the P6-1b provenance contract plus P6-2 measurement hashes; SDK must be real/non-null.
  const sdkVersion = getPackageVersion("openai");
  assert.equal(typeof sdkVersion, "string");
  assert(sdkVersion && sdkVersion.length > 0);
  const manifest = buildP62ExecutionManifest({
    repoRoot,
    repeatCount: 1,
    taskBankSha256: hashText(taskBankRaw),
    baselineRepositorySha256: hashRepository(repository),
    probeMaterial,
  });
  assert.equal(manifest.openAiSdkVersion, sdkVersion);
  assert.equal(manifest.model, "gpt-5.6-luna");
  assert.equal(manifest.reasoningEffort, "high");
  assert.equal(manifest.condition, "AF");
  assert.equal(manifest.taskBankVersion, "p6-1-full-task-bank-v3-postflight-coverage");
  for (const key of [
    "gitSha", "mutationPromptHash", "mutationSchemaHash", "openAiSdkVersion", "nodeVersion",
    "taskBankSha256", "baselineRepositorySha256", "runnerSha256", "codeFingerprintSha256",
    "probePromptTemplateHash", "probeSchemaHash", "booleanProbeBankSha256",
  ] as const) {
    assert.equal(typeof manifest[key], "string", `manifest.${key} should be a string`);
    assert((manifest[key] as string).length > 0, `manifest.${key} should be non-empty`);
  }

  const result = createP62Result({
    taskBankPath,
    taskBankRaw,
    tasks,
    repositoryPath: repositoryDir,
    repository,
    repeatCount: 1,
    manifest,
    booleanProbeIds: booleanProbes.map((probe) => probe.probeId),
  });
  assert.deepEqual(result.measurements.M.primaryTaskIds, [...P6_2_PRIMARY_TASK_IDS]);
  assert.deepEqual(result.measurements.M.eligibleDiagnosticTaskIds, [...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS]);
  assert.deepEqual(result.measurements.M.excludedSemanticFloorTaskIds, [...P6_2_SEMANTIC_FLOOR_TASK_IDS]);
  assert.equal(result.measurements.Rsem.designVersion, "stage1-neutral-relation-v2");
  assert.equal(result.measurements.Rsem.booleanProbeIds.length, 12);
  assert.equal(result.executionManifest.equivalenceDesignVersion, P6_2_EQUIVALENCE_DESIGN_VERSION);
  assert.equal(result.executionManifest.deltaM, 1 / 12);
  assert.equal(result.executionManifest.deltaR, 1 / 12);
  assert.equal(result.executionManifest.equivalenceCiLevel, 0.90);
  assert.equal(result.executionManifest.frozenScientificRepeatCount, null);
  assert.notStrictEqual(result.measurements.M, result.measurements.Rsem);
  assert.equal(result.measurements.Rsem.protocolReliability, null);

  // Mock M and R^sem outputs stay in independent fields and journals.
  const semanticMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 1,
    passed: false,
    validity: "valid",
    failureCategory: "test-failure",
    failureReason: "task-specific:mock semantic failure",
    executionStatus: "ok",
  }, "primary");
  assert.equal(semanticMock.failureDomain, "semantic");
  const protocolMock = classifyP62MRepeat({
    taskId: "T-crosscut-1",
    taskType: "crosscut",
    repeat: 1,
    passed: false,
    validity: "valid",
    failureCategory: "mutation-validation",
    failureReason: "mock path contract",
    executionStatus: "mutation-validation-failure",
  }, "primary");
  assert.equal(protocolMock.failureDomain, "protocol");
  const passedMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 2,
    passed: true,
    validity: "valid",
    failureCategory: null,
    failureReason: null,
    executionStatus: "ok",
  }, "primary");
  const infrastructureMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 3,
    passed: false,
    validity: "infrastructure-invalid",
    failureCategory: "provider",
    failureReason: "mock provider outage",
    executionStatus: "provider-error",
  }, "primary");
  const systemMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 4,
    passed: false,
    validity: "valid",
    failureCategory: "test-failure",
    failureReason: "visible:execution:mock runner failure",
    executionStatus: "ok",
  }, "primary");
  const otherMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 5,
    passed: false,
    validity: "valid",
    failureCategory: "unclassified-mock",
    failureReason: "mock unknown",
    executionStatus: "ok",
  }, "primary");
  const denominatorSummary = summarizeP62M([passedMock, protocolMock, infrastructureMock, systemMock, otherMock]);
  assert.equal(denominatorSummary.primary.totalRepeats, 5);
  assert.equal(denominatorSummary.primary.scientificallyValidRepeats, 2);
  assert.equal(denominatorSummary.primary.infrastructureInvalidRepeats, 1);
  assert.equal(denominatorSummary.primary.systemAuditRepeats, 1);
  assert.equal(denominatorSummary.primary.otherAuditRepeats, 1);
  assert.equal(denominatorSummary.primary.auditExcludedRepeats, 3);
  assert.equal(denominatorSummary.primary.passRate, 0.5);

  // needs-audit has a provenance-preserving adjudication exit.
  const adjudicationFixture: any = createP62Result({
    taskBankPath, taskBankRaw, tasks, repositoryPath: repositoryDir, repository, repeatCount: 1, manifest, booleanProbeIds: booleanProbes.map((probe) => probe.probeId),
  });
  const adjudicableSystem = { ...systemMock, role: "primary", modifiedPaths: [], workingNote: null, actualModel: "mock", usage: null, estimatedCostUsd: 0, visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null };
  adjudicationFixture.measurements.M.repeatResults.push(adjudicableSystem);
  adjudicationFixture.status = "needs-audit";
  adjudicationFixture.auditFlags.push({ measurement: "M", taskId: adjudicableSystem.taskId, repeat: adjudicableSystem.repeat, failureDomain: "system", executionStatus: adjudicableSystem.executionStatus, reason: adjudicableSystem.failureReason });
  applyP62Adjudication(adjudicationFixture, { measurement: "M", taskId: adjudicableSystem.taskId, repeat: adjudicableSystem.repeat, reviewer: "offline-verifier", reason: "artifact-caused compile/runtime failure", finalDisposition: "scientific-failure", adjudicatedAt: "2026-09-20T00:00:00.000Z" }, "mock-tool-sha");
  const adjudicatedM = adjudicationFixture.measurements.M.repeatResults[0];
  assert.equal(adjudicatedM.rawFailureDomain, "system");
  assert.equal(adjudicatedM.failureDomain, "semantic");
  assert.equal(adjudicatedM.adjudication.finalDisposition, "scientific-failure");
  assert.equal(adjudicationFixture.status, "running");
  assert.equal(adjudicationFixture.auditFlags[0].resolvedAt, "2026-09-20T00:00:00.000Z");

  const rsemMock: RSemProbeRepeatResult = {
    repeat: 1,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    executionStatus: "ok",
    validity: "valid",
    failureDomain: "none",
    rawFailureDomain: "none",
    adjudication: null,
    protocolValid: true,
    failureReason: null,
    rawResponse: "{}",
    modelProvenance: {
      provider: "openai",
      requestedModel: "gpt-5.6-luna",
      actualModel: "gpt-5.6-luna-mock",
      responseId: "resp_mock",
      responseStatus: "completed",
      reasoningEffort: "high",
      maxOutputTokens: 8000,
      requestTimeoutMs: 180000,
      maxRetries: 2,
      sdkVersion,
      providerErrorCode: null,
    },
    booleanCorrect: 11,
    booleanTotal: 12,
    booleanAccuracy: 11 / 12,
    probeDetails: [],
    actualModel: "gpt-5.6-luna-mock",
    usage: { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 },
    estimatedCostUsd: 0,
  };
  (result.measurements.M.repeatResults as any[]).push({ ...semanticMock, role: "primary", modifiedPaths: [], workingNote: null, actualModel: "mock", usage: null, estimatedCostUsd: 0, visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null });
  result.measurements.Rsem.repeatResults.push(rsemMock);
  assert.equal(result.measurements.M.repeatResults.length, 1);
  assert.equal(result.measurements.Rsem.repeatResults.length, 1);

  // Resume must fail closed on any frozen manifest mismatch, including repeat count.
  assertP62ResumeCompatible(result, manifest, taskBankRaw, repository);
  assertThrowsMessage(
    () => assertP62ResumeCompatible(result, { ...manifest, gitSha: "different-git-sha" }, taskBankRaw, repository),
    /frozen execution manifest changed/
  );
  assertThrowsMessage(
    () => assertP62ResumeCompatible(result, { ...manifest, repeatCount: 2 }, taskBankRaw, repository),
    /frozen execution manifest changed/
  );

  // Regression reproducer: the pre-fix co-located topology lets M recovery delete rsem/repeat-N.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "p6-af-baseline-"));
  try {
    const mJournalResult = {
      ...semanticMock,
      role: "primary" as const,
      modifiedPaths: [],
      workingNote: null,
      actualModel: "mock",
      usage: null,
      estimatedCostUsd: 0,
      visible: null,
      hidden: null,
      taskSpecific: null,
      protocolContractViolated: null,
    };
    const mArtifacts: RepeatArtifactBundle = {
      rawResponse: "mock",
      modifiedFiles: {},
      modelProvenance: { actualModel: "mock" },
      testResults: { mock: true },
      agentExecutionStatus: "ok",
      agentError: null,
      runnerError: null,
    };

    const legacyRoot = path.join(temp, "legacy-colocated");
    commitRepeatArtifactsAtomic(legacyRoot, mJournalResult, mArtifacts);
    commitProbeResultAtomic(legacyRoot, rsemMock);
    const legacyProbePath = path.join(legacyRoot, "rsem", "repeat-1", "probe_result.json");
    assert(fs.existsSync(legacyProbePath));
    reconcileRepeatJournal<typeof mJournalResult>(legacyRoot, []);
    assert(!fs.existsSync(legacyProbePath), "legacy co-located layout should reproduce Critical #1 deletion");

    // Fixed topology: M recovery is rooted at runDir/m and cannot traverse runDir/rsem.
    const fixedRoot = path.join(temp, "fixed-separated");
    const fixedMRoot = mJournalDirectory(fixedRoot);
    commitRepeatArtifactsAtomic(fixedMRoot, mJournalResult, mArtifacts);
    commitProbeResultAtomic(fixedRoot, rsemMock);
    const fixedProbePath = path.join(fixedRoot, "rsem", "repeat-1", "probe_result.json");
    const mRecovered = reconcileRepeatJournal<typeof mJournalResult>(fixedMRoot, []);
    assert.equal(mRecovered.recoveredArtifactKeys.length, 1);
    assert.equal(mRecovered.repeatResults[0].taskId, "T-local-2");
    assert(fs.existsSync(fixedProbePath), "M recovery must not delete the coexisting R^sem journal");
    const rRecovered = reconcileProbeJournal(fixedRoot, []);
    assert.deepEqual(rRecovered.recoveredArtifactRepeats, [1]);
    assert.equal(rRecovered.repeatResults[0].booleanAccuracy, 11 / 12);

    // R^sem failures are returned as journalable records; injected clients guarantee no live API call.
    const correctAnswers = Object.fromEntries(booleanProbes.map((probe) => [probe.probeId, String(probe.correctAnswer)]));
    const capturedClientOptions: Array<{ timeout: number; maxRetries: number }> = [];
    const success = await runRSemRepeat(
      repository,
      booleanProbes,
      2,
      fakeProbeFactory(completedProbeResponse(JSON.stringify(correctAnswers)), capturedClientOptions)
    );
    assert.equal(success.failureDomain, "none");
    assert.equal(success.rawFailureDomain, "none");
    assert.equal(success.protocolValid, true);
    assert.equal(success.booleanAccuracy, 1);
    assert.deepEqual(capturedClientOptions, [{ timeout: 180000, maxRetries: 2 }]);

    const refusalResponse = {
      ...completedProbeResponse(""),
      id: "resp_refusal",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "mock refusal" }] }],
    };
    const refusal = await runRSemRepeat(repository, booleanProbes, 3, fakeProbeFactory(refusalResponse));
    assert.equal(refusal.executionStatus, "response-refusal");
    assert.equal(refusal.failureDomain, "infrastructure");
    assert.equal(refusal.validity, "infrastructure-invalid");
    assert.equal(refusal.protocolValid, null);

    const incompleteResponse = {
      ...completedProbeResponse(""),
      id: "resp_incomplete",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    };
    const incomplete = await runRSemRepeat(repository, booleanProbes, 4, fakeProbeFactory(incompleteResponse));
    assert.equal(incomplete.executionStatus, "response-incomplete");
    assert.equal(incomplete.failureDomain, "infrastructure");

    const parseFailure = await runRSemRepeat(
      repository,
      booleanProbes,
      5,
      fakeProbeFactory(completedProbeResponse("not-json"))
    );
    assert.equal(parseFailure.executionStatus, "output-parse-failure");
    assert.equal(parseFailure.failureDomain, "protocol");
    assert.equal(parseFailure.validity, "valid");
    assert.equal(parseFailure.protocolValid, false);

    const apiError = Object.assign(new Error("mock API outage"), { code: "mock_provider_error" });
    const providerFailure = await runRSemRepeat(repository, booleanProbes, 6, fakeProbeFactory(apiError));
    assert.equal(providerFailure.executionStatus, "provider-error");
    assert.equal(providerFailure.failureDomain, "infrastructure");
    assert.equal(providerFailure.modelProvenance.providerErrorCode, "mock_provider_error");

    for (const failureResult of [refusal, incomplete, parseFailure, providerFailure]) {
      commitProbeResultAtomic(fixedRoot, failureResult);
    }
    const failureJournal = reconcileProbeJournal(fixedRoot, [rsemMock, refusal, incomplete, parseFailure, providerFailure]);
    assert.equal(failureJournal.missingArtifactRepeats.length, 0);
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "response-refusal" && item.failureDomain === "infrastructure"));
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "response-incomplete" && item.failureDomain === "infrastructure"));
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "output-parse-failure" && item.failureDomain === "protocol"));
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "provider-error" && item.failureDomain === "infrastructure"));

    const serializedPath = path.join(temp, "result.json");
    fs.writeFileSync(serializedPath, JSON.stringify(result, null, 2));
    const persisted = JSON.parse(fs.readFileSync(serializedPath, "utf8")) as P62AfBaselineResult;
    assert(Array.isArray(persisted.measurements.M.repeatResults));
    assert(Array.isArray(persisted.measurements.Rsem.repeatResults));
    assert.equal(persisted.measurements.M.repeatResults[0].failureDomain, "semantic");
    assert.equal(persisted.measurements.Rsem.repeatResults[0].designVersion, STAGE1_BOOLEAN_DESIGN_VERSION);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  // Selection is a frozen constant partition and cannot be changed by observed outcomes.
  const afterMockOutcomes = selectP62TaskBank(tasks);
  assert.deepEqual(afterMockOutcomes.primary.map((task) => task.taskId), [...P6_2_PRIMARY_TASK_IDS]);
  assert.deepEqual(afterMockOutcomes.diagnostic.map((task) => task.taskId), [...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS]);

  console.log("P6-2 AF baseline offline verification passed.");
  console.log(`  equivalence: Delta_M=Delta_R=${P6_2_DELTA_M.toFixed(6)}, 90% CI / alpha=0.05, target power=0.80`);
  console.log(`  exact power: sigma_U=Delta gives n=9 power=${sigmaEqualsDeltaPower9.toFixed(6)}, minimum n for power>=0.80 is ${exactSearch.requiredN}`);
  console.log(`  variance pilot: paired AF-vs-AF repeats=${P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS}, max attempts/pair=${P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR}, AB/BA counterbalanced, scientific repeat count still unfrozen/live-blocked`);
  console.log(`  task bank: primary=${selection.primary.length}, diagnostic=${selection.diagnostic.length}, floor-excluded=${P6_2_SEMANTIC_FLOOR_TASK_IDS.length}`);
  console.log(`  R^sem: ${STAGE1_BOOLEAN_DESIGN_VERSION}, boolean=${booleanProbes.length}, constant-baseline=0.50`);
  console.log(`  provenance: openai=${manifest.openAiSdkVersion}, node=${manifest.nodeVersion}`);
  console.log("  Critical #1 legacy topology reproducer: deletion confirmed; separated m/rsem topology: preserved");
  console.log("  R^sem failures: refusal/incomplete/parse/API error journalable via injected clients; live API calls: 0");
  console.log("  resume mismatch: rejected; M/Rsem journals: recovery verified; live API calls: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
