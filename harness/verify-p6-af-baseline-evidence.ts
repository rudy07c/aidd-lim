import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_REPO_PATH = "docs/findings/evidence/p6-2-af-baseline/result.json";
const PROBE_FIXTURE_REPO_PATH = "calibration/fixtures/probe-bank-stage1.json";
const EXPECTED_SHA256 = "b7b0e3f9598b034548b8466258a0aae54916fcdfa2ef0f53f9f85636272c7801";
const EXPECTED_SOURCE_GIT_SHA = "0a0fd1a262c2e4274f1b946562c9b4e79f6fb71b";
const EXPECTED_PRIMARY_TASK_IDS = [
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
];
const EXPECTED_DIAGNOSTIC_TASK_IDS = ["T-invariant-stress-1", "T-invariant-stress-3"];
const REACHABLE_COUNTEREXAMPLE_BOOLEAN_IDS = [
  "A-obfuscated-bool-r03",
  "A-obfuscated-bool-r05",
  "A-obfuscated-bool-r08",
  "A-obfuscated-bool-r09",
  "A-obfuscated-bool-r11",
  "A-obfuscated-bool-r12",
];

function approx(actual: number, expected: number, tolerance = 1e-12): void {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const evidencePath = path.join(repoRoot, EVIDENCE_REPO_PATH);
  assert(fs.existsSync(evidencePath), `missing committed evidence: ${EVIDENCE_REPO_PATH}`);

  const raw = fs.readFileSync(evidencePath);
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  assert.equal(sha256, EXPECTED_SHA256, "committed P6-2 AF baseline evidence changed");

  const result = JSON.parse(raw.toString("utf8"));
  assert.equal(result.schemaVersion, "p6-2-af-baseline-result-v5-task-selection-freeze");
  assert.equal(result.artifactLayoutVersion, "p6-2-af-baseline-artifacts-v2");
  assert.equal(result.baselineVersion, "p6-2-af-baseline-v7-repeat21-freeze");
  assert.equal(result.status, "completed");
  assert.equal(typeof result.completedAt, "string");
  assert.equal(result.model, "gpt-5.6-luna");
  assert.equal(result.reasoningEffort, "high");
  assert.equal(result.condition, "AF");
  assert.equal(result.repeatCount, 21);

  const manifest = result.executionManifest;
  assert.equal(manifest.gitSha, EXPECTED_SOURCE_GIT_SHA);
  assert.equal(manifest.taskBankVersion, "p6-1-full-task-bank-v3-postflight-coverage");
  assert.equal(manifest.taskSelectionVersion, "p6-2-task-selection-v2-postpilot-low-headroom-frozen");
  assert.deepEqual(manifest.primaryTaskIds, EXPECTED_PRIMARY_TASK_IDS);
  assert.deepEqual(manifest.postPilotLowHeadroomTaskIds, ["T-crosscut-5"]);
  assert.equal(manifest.equivalenceDesignVersion, "p6-2-equivalence-v4-11-task-repeat21-freeze");
  approx(manifest.deltaM, 1 / 11);
  approx(manifest.deltaR, 1 / 12);
  assert.equal(manifest.equivalenceAlpha, 0.05);
  assert.equal(manifest.equivalenceCiLevel, 0.9);
  assert.equal(manifest.equivalenceTargetPower, 0.8);
  assert.equal(manifest.frozenScientificRepeatCount, 21);
  assert.equal(manifest.model, "gpt-5.6-luna");
  assert.equal(manifest.reasoningEffort, "high");
  assert.equal(manifest.condition, "AF");
  assert.equal(manifest.repeatCount, 21);
  assert.equal(manifest.repeatCountSource, "frozen-scientific-repeat-count");

  assert.equal(result.auditFlags.length, 1);
  assert.equal(result.auditFlags.filter((flag: any) => !flag.resolvedAt).length, 0);
  const audit = result.auditFlags[0];
  assert.equal(audit.measurement, "M");
  assert.equal(audit.taskId, "T-invariant-stress-3");
  assert.equal(audit.repeat, 19);
  assert.equal(audit.failureDomain, "infrastructure");
  assert.equal(audit.executionStatus, "provider-error");
  assert.match(audit.reason, /429 You have no credits remaining/);
  assert.equal(audit.adjudication.finalDisposition, "infrastructure-invalid");
  assert.equal(audit.adjudication.toolVersion, "p6-2-adjudication-v1");
  assert.match(audit.adjudication.reason, /usage input\/output\/total=0/);

  const m = result.measurements.M;
  assert.deepEqual(m.primaryTaskIds, EXPECTED_PRIMARY_TASK_IDS);
  assert.deepEqual(m.eligibleDiagnosticTaskIds, EXPECTED_DIAGNOSTIC_TASK_IDS);
  assert.deepEqual(m.excludedPostPilotLowHeadroomTaskIds, ["T-crosscut-5"]);
  assert.equal(m.repeatResults.length, 273);

  const primary = m.repeatResults.filter((row: any) => row.role === "primary");
  const diagnostic = m.repeatResults.filter((row: any) => row.role === "diagnostic");
  assert.equal(primary.length, 231);
  assert.equal(diagnostic.length, 42);
  assert.equal(primary.filter((row: any) => row.failureDomain === "none").length, 217);
  assert.equal(primary.filter((row: any) => row.failureDomain === "protocol").length, 14);
  assert.equal(primary.filter((row: any) => row.failureDomain === "semantic").length, 0);
  assert.equal(primary.filter((row: any) => row.failureDomain === "infrastructure").length, 0);
  assert.equal(diagnostic.filter((row: any) => row.failureDomain === "none").length, 36);
  assert.equal(diagnostic.filter((row: any) => row.failureDomain === "protocol").length, 5);
  assert.equal(diagnostic.filter((row: any) => row.failureDomain === "infrastructure").length, 1);

  const primarySemanticEvaluable = primary.filter((row: any) => row.failureDomain === "none" || row.failureDomain === "semantic");
  assert.equal(primarySemanticEvaluable.length, 217);
  assert.equal(primarySemanticEvaluable.filter((row: any) => row.passed).length, 217);

  const primaryCounts = countBy(primary, (row: any) => row.taskId);
  for (const taskId of EXPECTED_PRIMARY_TASK_IDS) assert.equal(primaryCounts[taskId], 21, `${taskId} repeat count`);
  const diagnosticCounts = countBy(diagnostic, (row: any) => row.taskId);
  for (const taskId of EXPECTED_DIAGNOSTIC_TASK_IDS) assert.equal(diagnosticCounts[taskId], 21, `${taskId} repeat count`);
  assert.equal(m.repeatResults.some((row: any) => row.taskId === "T-crosscut-5"), false);

  assert.equal(m.summary.primary.taskCount, 11);
  assert.equal(m.summary.primary.totalRepeats, 231);
  assert.equal(m.summary.primary.scientificallyValidRepeats, 231);
  assert.equal(m.summary.primary.auditExcludedRepeats, 0);
  assert.equal(m.summary.primary.passed, 217);
  approx(m.summary.primary.passRate, 217 / 231);
  assert.equal(m.summary.diagnostic.taskCount, 2);
  assert.equal(m.summary.diagnostic.totalRepeats, 42);
  assert.equal(m.summary.diagnostic.scientificallyValidRepeats, 41);
  assert.equal(m.summary.diagnostic.infrastructureInvalidRepeats, 1);
  assert.equal(m.summary.diagnostic.auditExcludedRepeats, 1);
  assert.equal(m.summary.diagnostic.passed, 36);
  approx(m.summary.diagnostic.passRate, 36 / 41);
  assert.deepEqual(m.summary.failureDomains, {
    none: 253,
    semantic: 0,
    protocol: 19,
    system: 0,
    infrastructure: 1,
    other: 0,
  });

  const protocolRows = m.repeatResults.filter((row: any) => row.failureDomain === "protocol");
  assert.equal(protocolRows.length, 19);
  const outputParseRows = protocolRows.filter((row: any) => row.failureCategory === "output-parse");
  const mutationValidationRows = protocolRows.filter((row: any) => row.failureCategory === "mutation-validation");
  assert.equal(outputParseRows.length, 18);
  assert.equal(mutationValidationRows.length, 1);
  assert.equal(outputParseRows.every((row: any) => /^Duplicate modified file path: /.test(row.failureReason ?? "")), true);
  assert.equal(mutationValidationRows[0].failureReason, "write-outside-repository-contract:workingNote");

  const protocolByTask = sortedRecord(countBy(protocolRows, (row: any) => row.taskId));
  const duplicateByPath = sortedRecord(countBy(outputParseRows, (row: any) =>
    String(row.failureReason).replace(/^Duplicate modified file path: /, "")
  ));
  const protocolByTaskAndReason = sortedRecord(countBy(protocolRows, (row: any) => `${row.taskId} :: ${row.failureReason}`));
  assert.deepEqual(protocolByTask, sortedRecord({
    "T-crosscut-1": 1,
    "T-crosscut-3": 1,
    "T-crosscut-4": 2,
    "T-delayed-2": 3,
    "T-invariant-stress-3": 5,
    "T-local-2": 1,
    "T-local-3": 1,
    "T-local-4": 3,
    "T-local-5": 1,
    "T-local-7": 1,
  }));
  assert.deepEqual(duplicateByPath, sortedRecord({
    "src/fen/rules.ts": 3,
    "src/osk/rules.ts": 1,
    "src/protocol_adapter.ts": 1,
    "src/rush/rules.ts": 3,
    "src/rushZefFen.ts": 1,
    "src/tal/rules.ts": 3,
    "src/vok/rules.ts": 4,
    "src/zef/rules.ts": 2,
  }));
  assert.deepEqual(protocolByTaskAndReason, sortedRecord({
    "T-crosscut-1 :: Duplicate modified file path: src/protocol_adapter.ts": 1,
    "T-crosscut-3 :: Duplicate modified file path: src/osk/rules.ts": 1,
    "T-crosscut-4 :: Duplicate modified file path: src/fen/rules.ts": 2,
    "T-delayed-2 :: Duplicate modified file path: src/tal/rules.ts": 3,
    "T-invariant-stress-3 :: Duplicate modified file path: src/rush/rules.ts": 3,
    "T-invariant-stress-3 :: Duplicate modified file path: src/rushZefFen.ts": 1,
    "T-invariant-stress-3 :: Duplicate modified file path: src/zef/rules.ts": 1,
    "T-local-2 :: write-outside-repository-contract:workingNote": 1,
    "T-local-3 :: Duplicate modified file path: src/fen/rules.ts": 1,
    "T-local-4 :: Duplicate modified file path: src/vok/rules.ts": 3,
    "T-local-5 :: Duplicate modified file path: src/zef/rules.ts": 1,
    "T-local-7 :: Duplicate modified file path: src/vok/rules.ts": 1,
  }));

  const r = result.measurements.Rsem;
  assert.equal(r.designVersion, "stage1-neutral-relation-v2");
  assert.equal(r.booleanProbeIds.length, 12);
  assert.equal(r.repeatResults.length, 21);
  assert.equal(r.protocolEvaluableRepeats, 21);
  assert.equal(r.protocolValidRepeats, 21);
  assert.equal(r.protocolFailureRepeats, 0);
  assert.equal(r.protocolReliability, 1);
  assert.equal(r.repeatResults.every((row: any) => row.failureDomain === "none" && row.protocolValid === true), true);
  const booleanCorrect = r.repeatResults.reduce((sum: number, row: any) => sum + row.booleanCorrect, 0);
  const booleanTotal = r.repeatResults.reduce((sum: number, row: any) => sum + row.booleanTotal, 0);
  assert.equal(booleanCorrect, 235);
  assert.equal(booleanTotal, 252);
  approx(r.semanticAccuracyProtocolValid, 235 / 252);
  approx(r.meanBooleanAccuracy, 235 / 252);

  const probeCorrectCounts: Record<string, number> = Object.fromEntries(r.booleanProbeIds.map((id: string) => [id, 0]));
  const probeObservationCounts: Record<string, number> = Object.fromEntries(r.booleanProbeIds.map((id: string) => [id, 0]));
  for (const repeat of r.repeatResults) {
    assert.equal(repeat.probeDetails.length, 12);
    for (const detail of repeat.probeDetails) {
      assert(detail.probeId in probeCorrectCounts, `unexpected probe id: ${detail.probeId}`);
      probeObservationCounts[detail.probeId] += 1;
      if (detail.correct) probeCorrectCounts[detail.probeId] += 1;
    }
  }
  for (const id of r.booleanProbeIds) assert.equal(probeObservationCounts[id], 21, `${id} observation count`);
  assert.equal(probeCorrectCounts["A-obfuscated-bool-r11"], 4);
  for (const id of r.booleanProbeIds.filter((id: string) => id !== "A-obfuscated-bool-r11")) {
    assert.equal(probeCorrectCounts[id], 21, `${id} AF accuracy`);
  }

  const probeFixture = JSON.parse(fs.readFileSync(path.join(repoRoot, PROBE_FIXTURE_REPO_PATH), "utf8"));
  const fixtureById = new Map(probeFixture.map((probe: any) => [probe.probeId, probe]));
  const r11: any = fixtureById.get("A-obfuscated-bool-r11");
  assert(r11, "missing r11 fixture");
  assert.equal(r11.correctAnswer, false);
  assert.equal(r11.derivedFrom?.candidateSource, "reachable-counterexample");
  assert.equal(r11.derivedFrom?.matchedInvariantId, "I1");
  for (const id of REACHABLE_COUNTEREXAMPLE_BOOLEAN_IDS) {
    const probe: any = fixtureById.get(id);
    assert(probe, `missing counterexample fixture ${id}`);
    assert.equal(probe.correctAnswer, false, `${id} correctAnswer`);
    assert.equal(probe.derivedFrom?.candidateSource, "reachable-counterexample", `${id} candidateSource`);
  }
  for (const id of REACHABLE_COUNTEREXAMPLE_BOOLEAN_IDS.filter((id) => id !== "A-obfuscated-bool-r11")) {
    assert.equal(probeCorrectCounts[id], 21, `${id} reachable-counterexample AF accuracy`);
  }

  approx(result.estimatedCostUsd, 0.7923262, 1e-9);

  console.log("P6-2 committed AF baseline evidence verification passed.");
  console.log(`  evidence sha256: ${sha256}`);
  console.log("  primary M: 217/231 (93.94%), 14 protocol failures, 0 audit exclusions");
  console.log("  primary semantic-evaluable: 217/217 pass; 14 protocol failures are semantic-censored");
  console.log("  diagnostic M: 36/41 scientifically valid, 1 adjudicated infrastructure-invalid repeat");
  console.log("  M protocol failure categories: 18 output-parse duplicate-path + 1 mutation-validation write-outside-contract");
  console.log(`  M protocol by task: ${JSON.stringify(protocolByTask)}`);
  console.log(`  M duplicate path counts: ${JSON.stringify(duplicateByPath)}`);
  console.log(`  M protocol task/reason breakdown: ${JSON.stringify(protocolByTaskAndReason)}`);
  console.log("  Rsem: 235/252 (93.25%), protocol reliability 1.0");
  console.log(`  Rsem probe-wise correct/21: ${JSON.stringify(sortedRecord(probeCorrectCounts))}`);
  console.log("  unresolved audit flags: 0");
}

main();
