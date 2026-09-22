import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const EVIDENCE_REPO_PATH = "docs/findings/evidence/p6-2-af-baseline/result.json";
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

  approx(result.estimatedCostUsd, 0.7923262, 1e-9);

  console.log("P6-2 committed AF baseline evidence verification passed.");
  console.log(`  evidence sha256: ${sha256}`);
  console.log("  primary M: 217/231 (93.94%), 14 protocol failures, 0 audit exclusions");
  console.log("  diagnostic M: 36/41 scientifically valid, 1 adjudicated infrastructure-invalid repeat");
  console.log("  Rsem: 235/252 (93.25%), protocol reliability 1.0");
  console.log("  unresolved audit flags: 0");
}

main();
