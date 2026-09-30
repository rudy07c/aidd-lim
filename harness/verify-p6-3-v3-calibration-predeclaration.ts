import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { countStaticRepositoryPayloadTokens } from "./src/context/static-exposure";
import { P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";
import {
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_EXECUTION_PROTOCOL_VERSION,
} from "./src/p6/p6-3-execution-protocol";
import {
  P6_3_V3_ARTIFACT_BUDGETS,
  P6_3_V3_ARTIFACT_CHUNK_MAX_TOKENS,
  P6_3_V3_CALIBRATION_PREDECLARATION,
  P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
  P6_3_V3_DELTA_M,
  P6_3_V3_DELTA_R,
  P6_3_V3_FULL_ARTIFACT_TOKENS,
  selectP63V3ArtifactBudget,
  type P63V3ArmAggregate,
} from "./src/p6/p6-3-v3-calibration-predeclaration";
import { P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION } from "./src/context/p6-3-v3-final-static-exposure-selector";
import { P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION } from "./src/context/p6-3-v3-selector-structural-acceptance";

function loadRepository(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadRepository(full, baseDir, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function arm(
  label: P63V3ArmAggregate["label"],
  mRate: number,
  rsemRate: number
): P63V3ArmAggregate {
  return { label, mRate, rsemRate };
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const oldFreeze = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "frozen", "p6-3-el-structural-freeze.json"),
      "utf8"
    )
  ) as any;

  // 1. v3 keeps the historical pre-outcome capacity grid exactly unchanged.
  assert.equal(oldFreeze.status, "frozen-pass");
  assert.deepEqual(P6_3_V3_ARTIFACT_BUDGETS, oldFreeze.freezeCandidate.budgets);
  assert.equal(P6_3_V3_FULL_ARTIFACT_TOKENS, oldFreeze.freezeCandidate.T_EL);
  assert.equal(
    P6_3_V3_ARTIFACT_CHUNK_MAX_TOKENS,
    oldFreeze.freezeCandidate.staticExposureMaxTokensPerUnit
  );
  assert.deepEqual(
    P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds,
    oldFreeze.freezeCandidate.primaryMTaskIds
  );
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.namingSchemeId,
    oldFreeze.freezeCandidate.rsem.namingSchemeId
  );
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount,
    oldFreeze.freezeCandidate.rsem.booleanProbeCount
  );

  // 2. Current artifact repository still matches the frozen AF artifact-token capacity.
  const repository: Record<string, string> = {};
  const repositoryDir = path.join(repoRoot, "synthetic-world", "repository");
  loadRepository(repositoryDir, repositoryDir, repository);
  assert.equal(
    countStaticRepositoryPayloadTokens(repository),
    P6_3_V3_FULL_ARTIFACT_TOKENS,
    "artifact repository token capacity drifted from the reused capacity grid"
  );

  // 3. Measurement bank, repeat design, and endpoint margins are unchanged.
  assert.deepEqual(
    P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds,
    [...P6_2_PRIMARY_TASK_IDS]
  );
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskCount, 11);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount, 12);
  assert.equal(P6_3_V3_DELTA_M, 1 / 11);
  assert.equal(P6_3_V3_DELTA_R, 1 / 12);
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
    P6_3_CALIBRATION_REPEAT_COUNT
  );
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount, 12);
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.execution.scheduleVersion,
    P6_3_EXECUTION_PROTOCOL_VERSION
  );
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedMLogicalCells, 792);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedRSemLogicalCells, 72);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedTotalLogicalCells, 864);

  // 4. v3 treatment identity is pinned to the final selector and separated E_fixed.
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.selector.policyVersion,
    P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION
  );
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.selector.acceptanceSpecVersion,
    P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION
  );
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.selector.structurallyFrozen, true);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.fixedEnvironment.chargedToArtifactBudget, false);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.fixedEnvironment.oneBindingPerRun, true);
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.fixedEnvironment.identicalAcrossArmsMeasurementsAndRepeats,
    true
  );
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.b0Meaning,
    "zero-artifact-evidence-with-common-E_fixed-present"
  );

  // 5. Frozen co-gate selects the smallest qualifying interior budget.
  const multipleQualifiers = selectP63V3ArtifactBudget([
    arm("AF", 0.95, 0.95),
    arm("B4", 0.80, 0.80),
    arm("B2", 0.35, 0.35),
    arm("B0", 0.05, 0.05),
    arm("B3", 0.60, 0.60),
    arm("B1", 0.10, 0.10),
  ]);
  assert.equal(multipleQualifiers.status, "selected");
  assert.deepEqual(multipleQualifiers.qualifyingInteriorArms, ["B2", "B3", "B4"]);
  assert.equal(multipleQualifiers.selectedArm, "B2");
  assert.equal(multipleQualifiers.selectedBExpose, 1011);

  // 6. Both endpoints are conjunctive: failing either one rejects the arm.
  const endpointMismatch = selectP63V3ArtifactBudget([
    arm("B0", 0.00, 0.00),
    arm("B1", 0.20, 0.02),
    arm("B2", 0.25, 0.03),
    arm("B3", 0.30, 0.04),
    arm("B4", 0.35, 0.05),
    arm("AF", 0.90, 0.90),
  ]);
  assert.equal(endpointMismatch.status, "needs-design-audit");
  assert.equal(endpointMismatch.selectedBExpose, null);
  assert.equal(endpointMismatch.reason, "NO_CONJUNCTIVE_INTERIOR_BUDGET");

  // 7. AF-near or above-AF point estimates fail the upper interior guard.
  const afNear = selectP63V3ArtifactBudget([
    arm("B0", 0.00, 0.00),
    arm("B1", 0.02, 0.02),
    arm("B2", 0.04, 0.04),
    arm("B3", 0.95, 0.40),
    arm("B4", 0.96, 0.96),
    arm("AF", 0.94, 0.90),
  ]);
  assert.equal(afNear.status, "needs-design-audit");

  // 8. Monotonic dose response is not a prerequisite; only the predeclared guards matter.
  const nonMonotonic = selectP63V3ArtifactBudget([
    arm("B0", 0.05, 0.05),
    arm("B1", 0.40, 0.40),
    arm("B2", 0.30, 0.30),
    arm("B3", 0.50, 0.50),
    arm("B4", 0.85, 0.85),
    arm("AF", 0.95, 0.95),
  ]);
  assert.equal(nonMonotonic.status, "selected");
  assert.equal(nonMonotonic.selectedArm, "B1");

  // 9. No live authorization and no historical primary-estimate pooling are granted here.
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.liveAuthorization, false);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.confirmatoryStage1AEligible, false);
  assert.equal(P6_3_V3_CALIBRATION_PREDECLARATION.historicalV2PrimaryEstimatePooling, false);
  assert.equal(
    P6_3_V3_CALIBRATION_PREDECLARATION.historicalV2OutcomeUse,
    "not-an-input-to-grid-margins-or-selection-rule"
  );

  // 10. The predeclaration source itself must not import findings/results artifacts.
  const source = fs.readFileSync(
    path.join(__dirname, "src", "p6", "p6-3-v3-calibration-predeclaration.ts"),
    "utf8"
  );
  for (const forbidden of [
    "docs/findings",
    "p6_3_v2_result_summary",
    "runs/",
    "result-summary",
  ]) {
    assert(
      !source.includes(forbidden),
      `v3 calibration predeclaration contains forbidden outcome-derived dependency marker: ${forbidden}`
    );
  }

  process.stdout.write(JSON.stringify({
    status: "ok",
    predeclarationVersion: P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
    budgetGrid: P6_3_V3_ARTIFACT_BUDGETS,
    repeatCount: P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
    deltaM: P6_3_V3_DELTA_M,
    deltaR: P6_3_V3_DELTA_R,
    expectedTotalLogicalCells: P6_3_V3_CALIBRATION_PREDECLARATION.execution.expectedTotalLogicalCells,
    finalSelectorVersion: P6_3_V3_CALIBRATION_PREDECLARATION.selector.policyVersion,
    historicalV2PrimaryEstimatePooling: false,
    liveAuthorization: false,
    verified: [
      "historical-capacity-grid-reused-exactly",
      "artifact-token-capacity-still-4046",
      "measurement-banks-and-repeat-design-unchanged",
      "delta-m-and-delta-r-unchanged",
      "final-selector-and-fixed-environment-identity-pinned",
      "conjunctive-co-gate-and-minimum-budget-tie-break",
      "no-monotonicity-assumption",
      "no-v2-primary-estimate-pooling",
      "no-live-authorization",
      "no-outcome-artifact-dependency-in-predeclaration-source",
    ],
  }, null, 2) + "\n");
}

main();
