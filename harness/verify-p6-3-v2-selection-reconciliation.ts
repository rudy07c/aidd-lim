import * as assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  analyzeP63V2Selection,
  P6_3_V2_LIVE_EVIDENCE_REPO_PATH,
  P6_3_V2_LIVE_EVIDENCE_SHA256,
} from "./analyze-p6-3-v2-selection";
import type { P63V2CalibrationState } from "./src/p6/p6-3-v2-live-calibration-runner";

const HISTORICAL_ANALYZER_GIT_BLOB = "ea1cff950cb9162e6582f0cfbebee3c16b30567b";
const HISTORICAL_RESULT_GIT_BLOB = "858b08941362fab19e3cde44916dc092fe464417";

const repoRoot = path.resolve(__dirname, "..");
const analyzerPath = path.resolve(__dirname, "analyze-p6-3-v2-selection.ts");
const resultPath = path.resolve(
  repoRoot,
  "docs/findings/evidence/p6-3-v2-selection-analysis/result.json"
);
const summaryPath = path.resolve(repoRoot, "docs/findings/p6_3_v2_result_summary_ja.md");
const statePath = path.resolve(repoRoot, P6_3_V2_LIVE_EVIDENCE_REPO_PATH);

function gitBlobSha1(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(bytes).digest("hex");
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function byArm<T extends { arm: string }>(rows: readonly T[], arm: string): T {
  const row = rows.find((candidate) => candidate.arm === arm);
  if (!row) throw new Error(`missing arm ${arm}`);
  return row;
}

function loadAnalysisAndDurable(): { analysis: ReturnType<typeof analyzeP63V2Selection>; durable: any } {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as P63V2CalibrationState;
  return {
    analysis: analyzeP63V2Selection(state),
    durable: JSON.parse(fs.readFileSync(resultPath, "utf8")) as any,
  };
}

function verifyProvenance(): void {
  assert.equal(
    gitBlobSha1(analyzerPath),
    HISTORICAL_ANALYZER_GIT_BLOB,
    "reconciled analyzer must remain byte-identical to the final PR #33 analyzer blob"
  );
  assert.equal(
    gitBlobSha1(resultPath),
    HISTORICAL_RESULT_GIT_BLOB,
    "reconciled durable result must remain byte-identical to the final PR #33 result blob"
  );
  assert.equal(
    sha256(statePath),
    P6_3_V2_LIVE_EVIDENCE_SHA256,
    "frozen P6-3 v2 raw evidence changed"
  );
}

function verifyMachineResult(): void {
  const { analysis, durable } = loadAnalysisAndDurable();

  assert.equal(analysis.source.repoPath, durable.sourceEvidence.path);
  assert.equal(analysis.source.sha256, durable.sourceEvidence.sha256);
  assert.equal(analysis.source.liveCheckoutGitSha, durable.sourceEvidence.liveCheckoutGitSha);
  assert.equal(analysis.source.statePlanHash, durable.sourceEvidence.planHash);

  assert.equal(analysis.integrity.stateStatus, durable.integrity.stateStatus);
  assert.equal(analysis.integrity.totalLogicalCells, durable.integrity.totalLogicalCells);
  assert.equal(analysis.integrity.validScientificObservations, durable.integrity.validScientificObservations);
  assert.equal(analysis.integrity.committedAttempts, durable.integrity.committedAttempts);
  assert.equal(
    analysis.integrity.infrastructureInvalidCommittedAttempts,
    durable.integrity.infrastructureInvalidCommittedAttempts
  );
  assert.equal(analysis.integrity.interruptedAttempts, durable.integrity.interruptedAttempts);
  assert.equal(analysis.integrity.exhaustedLogicalCells, durable.integrity.exhaustedLogicalCells);
  assert.equal(analysis.integrity.unresolvedAuditFlag, durable.integrity.unresolvedAuditFlag);

  assert.equal(analysis.frozenRule.calibrationRepeats, durable.frozenRule.calibrationRepeats);
  assert.equal(analysis.frozenRule.primaryMTasks, durable.frozenRule.primaryMTasks);
  assert.equal(analysis.frozenRule.rsemPrimaryProbes, durable.frozenRule.rsemPrimaryProbes);
  assert.equal(analysis.frozenRule.deltaM, durable.frozenRule.deltaM);
  assert.equal(analysis.frozenRule.deltaR, durable.frozenRule.deltaR);
  assert.equal(analysis.frozenRule.mObservationsPerArm, durable.frozenRule.mObservationsPerArm);
  assert.equal(
    analysis.frozenRule.rsemProbeJudgmentsPerArm,
    durable.frozenRule.rsemProbeJudgmentsPerArm
  );
  assert.equal(analysis.frozenRule.mDeltaUnits, durable.frozenRule.mDeltaUnits);
  assert.equal(analysis.frozenRule.rsemDeltaUnits, durable.frozenRule.rsemDeltaUnits);
  assert.equal(analysis.frozenRule.tieBreak, durable.frozenRule.tieBreak);

  assert.equal(analysis.anchors.m.b0, durable.anchors.M.B0Mean);
  assert.equal(analysis.anchors.m.af, durable.anchors.M.AFMean);
  assert.equal(analysis.anchors.m.span, durable.anchors.M.span);
  assert.equal(analysis.anchors.m.minimumRequiredSpan, durable.anchors.M.minimumRequiredSpan);
  assert.equal(analysis.anchors.m.sufficient, durable.anchors.M.sufficient);
  assert.equal(analysis.anchors.rsem.b0, durable.anchors.Rsem.B0Mean);
  assert.equal(analysis.anchors.rsem.af, durable.anchors.Rsem.AFMean);
  assert.equal(analysis.anchors.rsem.span, durable.anchors.Rsem.span);
  assert.equal(
    analysis.anchors.rsem.minimumRequiredSpan,
    durable.anchors.Rsem.minimumRequiredSpan
  );
  assert.equal(analysis.anchors.rsem.sufficient, durable.anchors.Rsem.sufficient);

  for (const durableArm of durable.arms as any[]) {
    const computed = byArm(analysis.arms, durableArm.arm);
    assert.equal(computed.budgetTokens, durableArm.budgetTokens);
    assert.equal(computed.m.passCount, durableArm.M.passCount);
    assert.equal(computed.m.observations, durableArm.M.total);
    assert.equal(computed.m.mean, durableArm.M.mean);
    assert.equal(computed.rsem.correct, durableArm.Rsem.correct);
    assert.equal(computed.rsem.total, durableArm.Rsem.total);
    assert.equal(computed.rsem.mean, durableArm.Rsem.mean);

    if (durableArm.candidate === null) {
      assert.equal(computed.gate, null);
    } else {
      assert.ok(computed.gate, `${durableArm.arm}: missing computed interior gate`);
      assert.equal(computed.gate.mAboveB0Units, durableArm.M.aboveB0Units);
      assert.equal(computed.gate.mBelowAfUnits, durableArm.M.belowAFUnits);
      assert.equal(computed.gate.mPassesPointGuard, durableArm.M.passes);
      assert.equal(computed.gate.rsemAboveB0Units, durableArm.Rsem.aboveB0Units);
      assert.equal(computed.gate.rsemBelowAfUnits, durableArm.Rsem.belowAFUnits);
      assert.equal(computed.gate.rsemPassesPointGuard, durableArm.Rsem.passes);
      assert.equal(computed.gate.conjunctiveCandidate, durableArm.candidate);
    }
  }

  assert.deepEqual(analysis.qualifyingInteriorArms, durable.qualifyingInteriorArms);
  assert.equal(analysis.selectionStatus, durable.selectionStatus);
  assert.deepEqual(analysis.selectedBExpose, durable.selectedBExpose);
  assert.deepEqual(analysis.reasonCodes, durable.reasonCodes);
  assert.deepEqual(analysis.interpretationBoundary, durable.interpretationBoundary);
}

function verifyCurrentSummary(): void {
  const durable = JSON.parse(fs.readFileSync(resultPath, "utf8")) as any;
  const summary = fs.readFileSync(summaryPath, "utf8");

  for (const durableArm of durable.arms as any[]) {
    const line = summary
      .split("\n")
      .find((candidate) => candidate.startsWith(`| ${durableArm.arm} | ${durableArm.budgetTokens} |`));
    assert.ok(line, `current main summary is missing ${durableArm.arm} result row`);
    assert.ok(
      line.includes(`${durableArm.M.passCount} / ${durableArm.M.total}`),
      `${durableArm.arm}: current summary M count drifted from machine result`
    );
    assert.ok(
      line.includes(`${durableArm.Rsem.correct} / ${durableArm.Rsem.total}`),
      `${durableArm.arm}: current summary Rsem count drifted from machine result`
    );
  }

  assert.ok(summary.includes("qualifyingInteriorArms = []"));
  assert.ok(summary.includes("selectedBExpose = null"));
  assert.ok(summary.includes("selectionStatus = needs-design-audit"));
  assert.ok(summary.includes("reason = NO_CONJUNCTIVE_INTERIOR_BUDGET"));
}

function main(): void {
  const scope = process.argv[2] ?? "all";
  if (scope === "provenance" || scope === "all") verifyProvenance();
  if (scope === "machine" || scope === "all") verifyMachineResult();
  if (scope === "summary" || scope === "all") verifyCurrentSummary();
  if (!["provenance", "machine", "summary", "all"].includes(scope)) {
    throw new Error(`unknown reconciliation verification scope: ${scope}`);
  }
  console.log(`P6-3 v2 selection reconciliation verification passed (${scope})`);
}

main();
