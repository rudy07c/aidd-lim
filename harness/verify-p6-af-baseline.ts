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
  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
} from "./src/p6/af-baseline";
import {
  assertP62ResumeCompatible,
  buildP62ExecutionManifest,
  commitProbeResultAtomic,
  createP62Result,
  reconcileProbeJournal,
  type P62AfBaselineResult,
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

async function main(): Promise<void> {
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
  const probes = generateStage1Probes(groundTruth, scheme, path.join(repositoryDir, "tests/visible.test.ts"));
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
  assert.notStrictEqual(result.measurements.M, result.measurements.Rsem);

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

  const rsemMock: RSemProbeRepeatResult = {
    repeat: 1,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
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

  // Atomic artifact journals can recover committed M / R^sem repeats missing from result.json.
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
    commitRepeatArtifactsAtomic(temp, mJournalResult, mArtifacts);
    const mRecovered = reconcileRepeatJournal<typeof mJournalResult>(temp, []);
    assert.equal(mRecovered.recoveredArtifactKeys.length, 1);
    assert.equal(mRecovered.repeatResults[0].taskId, "T-local-2");

    commitProbeResultAtomic(temp, rsemMock);
    const rRecovered = reconcileProbeJournal(temp, []);
    assert.deepEqual(rRecovered.recoveredArtifactRepeats, [1]);
    assert.equal(rRecovered.repeatResults[0].booleanAccuracy, 11 / 12);

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
  console.log(`  task bank: primary=${selection.primary.length}, diagnostic=${selection.diagnostic.length}, floor-excluded=${P6_2_SEMANTIC_FLOOR_TASK_IDS.length}`);
  console.log(`  R^sem: ${STAGE1_BOOLEAN_DESIGN_VERSION}, boolean=${booleanProbes.length}, constant-baseline=0.50`);
  console.log(`  provenance: openai=${manifest.openAiSdkVersion}, node=${manifest.nodeVersion}`);
  console.log("  resume mismatch: rejected; M/Rsem journals: recovery verified; live API calls: 0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
