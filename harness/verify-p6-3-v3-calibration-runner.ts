import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import type { GroundTruthDelta } from "../synthetic-world/schema";
import {
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  type FixedEnvironmentBinding,
} from "./src/context/fixed-environment-runtime";
import {
  P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
} from "./src/context/p6-3-v3-final-static-exposure-selector";
import type { P63V3ExposureTaskDescriptor } from "./src/context/p6-3-v3-static-exposure-runtime";
import type { P63CellOutcome } from "./src/p6/p6-3-live-calibration-runner";
import {
  P6_3_V3_CALIBRATION_PREDECLARATION,
  P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
} from "./src/p6/p6-3-v3-calibration-predeclaration";
import {
  buildP63V3CalibrationPlan,
  buildP63V3CellExposure,
  p63V3CalibrationPlanHash,
  prepareP63V3CalibrationRun,
  P6_3_V3_CALIBRATION_RUNNER_VERSION,
  type P63V3CalibrationTreatmentProvenance,
} from "./src/p6/p6-3-v3-calibration-runner";
import type { P63V3RunFixedEnvironmentProvenance } from "./src/p6/p6-3-v3-run-start";

interface FixtureTask extends P63V3ExposureTaskDescriptor {
  type?: string;
  taskSpecificTestCode?: string;
  namingScheme: string;
  groundTruthDelta: GroundTruthDelta;
}

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

function fakeOutcome(
  args: { exposure: any; fixedEnvironment: Readonly<FixedEnvironmentBinding> }
): P63CellOutcome {
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: null,
    semanticScore: null,
    protocolValid: true,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: args.exposure,
    diagnosticSummary: {
      fixedEnvironmentIdentity: fixedEnvironmentIdentity(args.fixedEnvironment),
    },
    artifactPayload: {
      fixedEnvironment: fixedEnvironmentLogSnapshot(args.fixedEnvironment),
      offlineVerifierMock: true,
    },
  };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");
  const repositoryFiles: Record<string, string> = {};
  loadRepository(repositoryDir, repositoryDir, repositoryFiles);

  const rawTasks = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")
  ) as Array<Record<string, unknown>>;
  const primaryIds = P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.primaryTaskIds;
  const taskById = new Map<string, FixtureTask>();
  for (const raw of rawTasks) {
    const taskId = String(raw.taskId ?? "");
    if (!primaryIds.includes(taskId as any)) continue;
    if (typeof raw.visibleInstruction !== "string") throw new Error(`${taskId}: visibleInstruction missing`);
    if (typeof raw.namingScheme !== "string") throw new Error(`${taskId}: namingScheme missing`);
    if (!raw.groundTruthDelta || typeof raw.groundTruthDelta !== "object") {
      throw new Error(`${taskId}: groundTruthDelta missing`);
    }
    taskById.set(taskId, {
      taskId,
      type: typeof raw.type === "string" ? raw.type : undefined,
      visibleInstruction: raw.visibleInstruction,
      taskSpecificTestCode:
        typeof raw.taskSpecificTestCode === "string" ? raw.taskSpecificTestCode : undefined,
      namingScheme: raw.namingScheme,
      groundTruthDelta: raw.groundTruthDelta as GroundTruthDelta,
    });
  }
  assert.deepEqual([...taskById.keys()], [...primaryIds], "primary M task bank/order drifted");

  const allProbes = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "calibration", "fixtures", "probe-bank-stage1.json"), "utf8")
  ) as GeneratedProbe[];
  const booleanProbes = allProbes.filter(
    (probe) =>
      probe.type === "boolean" &&
      probe.namingScheme === P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.namingSchemeId
  );
  assert.equal(
    booleanProbes.length,
    P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount,
    "Rsem boolean bank drifted"
  );
  const probePrompts = booleanProbes.map((probe) => probe.prompt);

  // 1. Exact predeclared 864-cell plan is deterministic and balanced.
  const planA = buildP63V3CalibrationPlan();
  const planB = buildP63V3CalibrationPlan();
  assert.deepEqual(planA, planB);
  assert.equal(planA.length, 864);
  assert.equal(planA.filter((cell) => cell.measurement === "M").length, 792);
  assert.equal(planA.filter((cell) => cell.measurement === "Rsem").length, 72);
  assert.equal(p63V3CalibrationPlanHash(planA), p63V3CalibrationPlanHash(planB));
  const armCounts = new Map<string, number>();
  for (const cell of planA) armCounts.set(cell.armLabel, (armCounts.get(cell.armLabel) ?? 0) + 1);
  for (const label of ["B0", "B1", "B2", "B3", "B4", "AF"]) {
    assert.equal(armCounts.get(label), 144, `${label}: unbalanced logical-cell count`);
  }

  // 2. Build artifact exposure for all 864 cells from the final selector path.
  const exposureByLogicalTreatment = new Map<string, string>();
  const armExposureModes = new Map<string, Set<string>>();
  let b0Cells = 0;
  let afCells = 0;
  for (const cell of planA) {
    const exposure = buildP63V3CellExposure({
      cell,
      repositoryFiles,
      syntheticWorldDir,
      taskById,
      probePrompts,
    });
    assert.equal(exposure.evidence.fullRepositoryTokens, 4046);
    if (cell.armKind === "AF") {
      afCells += 1;
      assert.equal(exposure.evidence.mode, "AF-full");
      assert.equal(exposure.evidence.actualExposedTokens, 4046);
      assert.deepEqual(Object.keys(exposure.contextFiles).sort(), Object.keys(repositoryFiles).sort());
    } else {
      assert.equal(exposure.evidence.mode, "EL-static");
      assert.equal(typeof cell.budgetTokens, "number");
      assert(exposure.evidence.actualExposedTokens <= (cell.budgetTokens as number));
      if (cell.armLabel === "B0") {
        b0Cells += 1;
        assert.equal(exposure.evidence.actualExposedTokens, 0);
        assert.deepEqual(exposure.contextFiles, {});
      }
      assert.ok(exposure.evidence.selectorPlanHash, `${cell.sequence}: missing v3 selector plan hash`);
    }
    const logicalTreatmentKey = `${cell.measurement}:${cell.taskId ?? "bank"}:${cell.armLabel}`;
    const fingerprint = JSON.stringify({
      contextFiles: exposure.contextFiles,
      evidence: exposure.evidence,
    });
    const previous = exposureByLogicalTreatment.get(logicalTreatmentKey);
    if (previous === undefined) exposureByLogicalTreatment.set(logicalTreatmentKey, fingerprint);
    else assert.equal(fingerprint, previous, `${logicalTreatmentKey}: repeat exposure drifted`);
    const modes = armExposureModes.get(cell.armLabel) ?? new Set<string>();
    modes.add(exposure.evidence.mode);
    armExposureModes.set(cell.armLabel, modes);
  }
  assert.equal(b0Cells, 144);
  assert.equal(afCells, 144);
  for (const label of ["B0", "B1", "B2", "B3", "B4"]) {
    assert.deepEqual([...armExposureModes.get(label)!], ["EL-static"]);
  }
  assert.deepEqual([...armExposureModes.get("AF")!], ["AF-full"]);
  assert.equal(exposureByLogicalTreatment.size, 72, "expected 11×6 M plus 1×6 Rsem exposure families");

  // 3. Prepare one production Generation-0 E_fixed binding, but inject mock
  // executors so this verifier can exercise every run-start closure offline.
  const persistedFixed: P63V3RunFixedEnvironmentProvenance[] = [];
  const persistedTreatment: P63V3CalibrationTreatmentProvenance[] = [];
  const receivedBindingRefs = new Set<Readonly<FixedEnvironmentBinding>>();
  let mMockCalls = 0;
  let rsemMockCalls = 0;
  const prepared = await prepareP63V3CalibrationRun({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance: (value) => {
        persistedFixed.push(value as P63V3RunFixedEnvironmentProvenance);
      },
      persistCalibrationTreatmentProvenance: (value) => {
        persistedTreatment.push(value as P63V3CalibrationTreatmentProvenance);
      },
    },
    runStartDependencies: {
      executeMCell: async (args: any) => {
        mMockCalls += 1;
        receivedBindingRefs.add(args.fixedEnvironment);
        return fakeOutcome(args);
      },
      executeRSemCell: async (args: any) => {
        rsemMockCalls += 1;
        receivedBindingRefs.add(args.fixedEnvironment);
        return fakeOutcome(args);
      },
    },
  });
  assert.equal(persistedFixed.length, 1, "run-fixed E_fixed provenance must persist exactly once");
  assert.equal(persistedTreatment.length, 1, "treatment provenance must persist exactly once");
  assert.equal(prepared.plan.length, 864);
  assert.equal(prepared.planHash, p63V3CalibrationPlanHash(planA));
  assert.equal(prepared.provenance.predeclarationVersion, P6_3_V3_CALIBRATION_PREDECLARATION_VERSION);
  assert.equal(prepared.provenance.runnerVersion, P6_3_V3_CALIBRATION_RUNNER_VERSION);
  assert.equal(prepared.provenance.finalSelectorVersion, P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION);
  assert.equal(prepared.provenance.liveAuthorized, false);
  assert.equal(
    prepared.provenance.fixedEnvironmentIdentity,
    prepared.runStart.provenance.fixedEnvironmentIdentity
  );
  assert.equal(
    persistedTreatment[0].fixedEnvironmentIdentity,
    persistedFixed[0].fixedEnvironmentIdentity
  );

  // 4. Exercise all 864 cells with mocks through runStart. The run-start wrapper
  // fail-closes unless each outcome reports the exact one run-fixed binding.
  for (const cell of prepared.plan) {
    const exposure = buildP63V3CellExposure({
      cell,
      repositoryFiles,
      syntheticWorldDir,
      taskById,
      probePrompts,
    });
    if (cell.measurement === "M") {
      const task = taskById.get(cell.taskId ?? "");
      if (!task) throw new Error(`missing task ${String(cell.taskId)}`);
      await prepared.runStart.executeMCell({
        contextFiles: exposure.contextFiles,
        evaluationRepository: repositoryFiles,
        syntheticWorldDir,
        task,
        repeat: cell.repeat,
        contextBudget: cell.budgetTokens,
        exposure: exposure.evidence,
      });
    } else {
      await prepared.runStart.executeRSemCell({
        contextFiles: exposure.contextFiles,
        probes: booleanProbes,
        repeat: cell.repeat,
        exposure: exposure.evidence,
      });
    }
  }
  assert.equal(mMockCalls, 792);
  assert.equal(rsemMockCalls, 72);
  assert.equal(receivedBindingRefs.size, 1, "all 864 cells must receive one identical binding object");
  assert.ok(receivedBindingRefs.has(prepared.runStart.fixedEnvironment));

  // 5. New v3 runner/exposure modules must not import the historical v2 live
  // executors/runner or any scientific outcome artifacts.
  for (const sourcePath of [
    path.join(__dirname, "src", "p6", "p6-3-v3-calibration-runner.ts"),
    path.join(__dirname, "src", "context", "p6-3-v3-static-exposure-runtime.ts"),
  ]) {
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const forbidden of [
      "p6-3-live-executors",
      "p6-3-v2-live-executors",
      "p6_3_v2_result_summary",
      "docs/findings",
      "runs/",
    ]) {
      assert(!source.includes(forbidden), `${path.basename(sourcePath)} imports/mentions forbidden historical outcome path: ${forbidden}`);
    }
  }

  process.stdout.write(JSON.stringify({
    status: "ok",
    runnerVersion: P6_3_V3_CALIBRATION_RUNNER_VERSION,
    predeclarationVersion: P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
    finalSelectorVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
    logicalCells: prepared.plan.length,
    mCells: mMockCalls,
    rsemCells: rsemMockCalls,
    distinctExposureFamilies: exposureByLogicalTreatment.size,
    b0Cells,
    afCells,
    fixedEnvironmentIdentity: prepared.provenance.fixedEnvironmentIdentity,
    identicalBindingObjectCount: receivedBindingRefs.size,
    providerCalls: 0,
    liveAuthorized: false,
    verified: [
      "864-cell-plan-from-predeclaration",
      "balanced-arm-schedule",
      "all-el-exposures-use-v3-final-selector-path",
      "b0-zero-artifact-evidence",
      "af-full-artifact-evidence",
      "repeat-exposure-determinism",
      "one-generation-zero-fixed-environment",
      "same-binding-object-across-all-864-mocked-cells",
      "run-fixed-and-treatment-provenance-persisted",
      "historical-v2-runner-and-outcome-artifacts-not-imported",
      "no-provider-calls",
    ],
  }, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
