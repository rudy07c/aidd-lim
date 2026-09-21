import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,
  P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_SELECTION_VERSION,
} from "./src/p6/af-baseline";
import {
  P6_2_HISTORICAL_VARIANCE_RESULT_REPO_PATH,
  P6_2_POSTPILOT_AUDIT_ARTIFACT_REPO_PATH,
  reanalyzeHistoricalVariancePilot,
} from "./reanalyze-p6-af-variance-pilot";

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const sourcePath = path.join(repoRoot, P6_2_HISTORICAL_VARIANCE_RESULT_REPO_PATH);
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const analysis = reanalyzeHistoricalVariancePilot(source);

  assert.equal(P6_2_TASK_SELECTION_VERSION, "p6-2-task-selection-v2-postpilot-low-headroom-frozen");
  assert.equal(P6_2_PRIMARY_TASK_IDS.length, 11);
  assert.deepEqual([...P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS], ["T-crosscut-5"]);
  assert(!P6_2_SEMANTIC_FLOOR_TASK_IDS.includes("T-crosscut-5" as any));
  assert.deepEqual(analysis.candidateTaskIds, ["T-crosscut-5"]);

  const t5 = analysis.taskAudit.find((row) => row.taskId === "T-crosscut-5");
  assert.ok(t5, "T-crosscut-5 audit row missing");
  assert.equal(t5.observations, 16);
  assert.equal(t5.successes, 4);
  assert.equal(t5.semanticFailures, 11);
  assert.equal(t5.protocolFailures, 1);
  assert.equal(t5.semanticEvaluable, 15);
  assert(Math.abs((t5.semanticSuccessRate ?? NaN) - 4 / 15) < 1e-15);
  assert.equal(t5.dominantSignatureCount, 11);
  assert.equal(t5.dominantSignatureShareOfSemanticFailures, 1);
  assert(t5.dominantSemanticFailure?.includes("fails when Osk=nim"));
  assert.equal(t5.lowHeadroomCandidate, true);

  for (const row of analysis.taskAudit) {
    if (row.taskId === "T-crosscut-5") continue;
    assert.equal(row.semanticFailures, 0, `${row.taskId} unexpectedly has semantic failures`);
    assert.equal(row.lowHeadroomCandidate, false, `${row.taskId} unexpectedly qualifies as low-headroom`);
  }

  const diagnostic = analysis.historicalElevenTaskReanalysis;
  assert.equal(diagnostic.freezeEligible, false);
  assert.equal(diagnostic.m.requiredN, 21);
  assert.equal(diagnostic.rsem.requiredN, 11);
  assert.equal(diagnostic.diagnosticCommonRepeatCandidate, 21);
  assert(Math.abs(diagnostic.m.sampleSd - 0.07586572367238914) < 1e-12);
  assert(Math.abs(diagnostic.m.rawSigmaUpper - 0.13634214080510768) < 1e-12);

  const artifactPath = path.join(repoRoot, P6_2_POSTPILOT_AUDIT_ARTIFACT_REPO_PATH);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.deepEqual(artifact.candidateTaskIds, ["T-crosscut-5"]);
  assert.equal(artifact.classificationDecision.currentP6_2PlusClassification, "post-pilot-low-headroom");
  assert.equal(artifact.classificationDecision.semanticFloor, false);
  assert.equal(artifact.historicalElevenTaskReanalysis.freezeEligible, false);
  assert.equal(artifact.historicalElevenTaskReanalysis.mRequiredN, 21);

  const oracle = fs.readFileSync(path.join(repoRoot, "harness/fixtures/oracle-patches/T-crosscut-5.ts"), "utf8");
  assert(oracle.includes("preconditions: Osk(E5) = q2(pex)"));
  assert(oracle.includes("Osk=pex が必要"));

  const prePilotFailure = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "runs/stage0_5/stage0_5-alltask-anthropic-claude-haiku-4-5-20251001__2026-09-07T08-25-10/system2/B1K/T-crosscut-5/task_specific_test_result.json"),
    "utf8"
  ));
  const oskFailure = prePilotFailure.testCases.find((x: any) => x.testName.includes("fails when Osk=nim"));
  assert.ok(oskFailure, "pre-pilot Osk=nim failure evidence missing");
  assert.equal(oskFailure.passed, false);

  const freshPath = path.join(
    repoRoot,
    "docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json"
  );
  const fresh = JSON.parse(fs.readFileSync(freshPath, "utf8"));
  assert.equal(fresh.status, "completed-awaiting-repeat-freeze");
  assert.equal(fresh.manifest.gitSha, "6d133b480f90e297970991f1c10c8b016b32d066");
  assert.equal(fresh.manifest.taskSelectionVersion, P6_2_TASK_SELECTION_VERSION);
  assert.deepEqual(fresh.manifest.primaryTaskIds, [...P6_2_PRIMARY_TASK_IDS]);
  assert.deepEqual(fresh.manifest.postPilotLowHeadroomTaskIds, ["T-crosscut-5"]);
  assert.equal(fresh.manifest.deltaM, 1 / 11);
  assert.equal(fresh.manifest.deltaR, 1 / 12);
  assert.equal(fresh.acceptedPairs.length, 8);
  assert.equal(fresh.sizing.needsAudit, false);
  assert.equal(fresh.sizing.auditKind, null);
  assert.equal(fresh.sizing.m.requiredN, 21);
  assert.equal(fresh.sizing.rsem.requiredN, 16);
  assert.equal(fresh.sizing.frozenScientificRepeatCount, 21);
  assert(Math.abs(fresh.sizing.m.sampleSd - 0.07586572367238911) < 1e-12);
  assert(Math.abs(fresh.sizing.m.rawSigmaUpper - 0.13634214080510762) < 1e-12);
  assert(Math.abs(fresh.sizing.rsem.sampleSd - 0.05892556509887899) < 1e-12);
  assert(Math.abs(fresh.sizing.rsem.rawSigmaUpper - 0.1058981224304308) < 1e-12);
  assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, 21);

  console.log("P6-2 historical variance reanalysis audit verification passed.");
  console.log("  candidate: T-crosscut-5 only; label=post-pilot-low-headroom (not semantic-floor)");
  console.log("  historical 11-task reanalysis is diagnostic-only: M requiredN=21, Rsem=11, freezeEligible=false");
  console.log("  independent pre-pilot Osk-dependency evidence verified from oracle fixture and Stage 0.5 result");
  console.log("  fresh 11-task pilot verified: M requiredN=21, Rsem=16, frozen repeat=21, needsAudit=false");
}

main();
