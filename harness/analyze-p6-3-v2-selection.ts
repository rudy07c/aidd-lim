import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_RSEM_PRIMARY_PROBE_COUNT,
} from "./src/p6/af-baseline";
import {
  P6_3_EXPECTED_M_CALL_COUNT,
  P6_3_EXPECTED_NORMAL_CALL_COUNT,
  P6_3_EXPECTED_RSEM_CALL_COUNT,
  type P63ArmLabel,
} from "./src/p6/p6-3-live-calibration-runner";
import { P6_3_V2_FROZEN_BUDGETS } from "./src/p6/p6-3-v2-cli-preflight";
import type {
  P63V2AttemptRecord,
  P63V2CalibrationState,
} from "./src/p6/p6-3-v2-live-calibration-runner";

export const P6_3_V2_SELECTION_ANALYSIS_SCHEMA =
  "p6-3-v2-budget-selection-analysis-v1" as const;
export const P6_3_V2_LIVE_EVIDENCE_REPO_PATH =
  "docs/findings/evidence/p6-3-v2-live-calibration/state.json" as const;
export const P6_3_V2_LIVE_EVIDENCE_SHA256 =
  "e5579674e5fa83c6b68b8f73b9ce67897f7de6cc5f24486f81b57f822ca03069" as const;
export const P6_3_V2_LIVE_SOURCE_CHECKOUT =
  "62110faebc0fa748effa90cb0f44f7c05f479c10" as const;
export const P6_3_V2_CALIBRATION_REPEATS = 12 as const;

const ARM_ORDER: readonly P63ArmLabel[] = ["B0", "B1", "B2", "B3", "B4", "AF"];
const INTERIOR_ARMS: readonly P63ArmLabel[] = ["B1", "B2", "B3", "B4"];
const EPSILON = 1e-12;

type MRepeatSummary = {
  repeat: number;
  passCount: number;
  total: number;
  mean: number;
};

type RSemRepeatSummary = {
  repeat: number;
  correct: number;
  total: number;
  mean: number;
  protocolValid: boolean | null;
};

export interface P63V2ArmSelectionSummary {
  arm: P63ArmLabel;
  budgetTokens: number;
  m: {
    observations: number;
    passCount: number;
    mean: number;
    repeatMeans: MRepeatSummary[];
  };
  rsem: {
    observations: number;
    correct: number;
    total: number;
    mean: number;
    repeatMeans: RSemRepeatSummary[];
  };
  gate: null | {
    mAboveB0Units: number;
    mBelowAfUnits: number;
    rsemAboveB0Units: number;
    rsemBelowAfUnits: number;
    mPassesPointGuard: boolean;
    rsemPassesPointGuard: boolean;
    conjunctiveCandidate: boolean;
  };
}

export interface P63V2SelectionAnalysis {
  schemaVersion: typeof P6_3_V2_SELECTION_ANALYSIS_SCHEMA;
  runClass: "scientific-calibration";
  calibrationOnly: true;
  confirmatoryStage1AEligible: false;
  source: {
    repoPath: typeof P6_3_V2_LIVE_EVIDENCE_REPO_PATH;
    sha256: typeof P6_3_V2_LIVE_EVIDENCE_SHA256;
    liveCheckoutGitSha: typeof P6_3_V2_LIVE_SOURCE_CHECKOUT;
    statePlanHash: string;
  };
  integrity: {
    stateStatus: string;
    totalLogicalCells: number;
    validScientificObservations: number;
    committedAttempts: number;
    infrastructureInvalidCommittedAttempts: number;
    interruptedAttempts: number;
    exhaustedLogicalCells: number;
    unresolvedAuditFlag: boolean;
  };
  frozenRule: {
    calibrationRepeats: number;
    primaryMTasks: number;
    rsemPrimaryProbes: number;
    deltaM: number;
    deltaR: number;
    mObservationsPerArm: number;
    rsemObservationsPerArm: number;
    rsemProbeJudgmentsPerArm: number;
    mDeltaUnits: number;
    rsemDeltaUnits: number;
    tieBreak: "smallest-qualifying-interior-budget";
  };
  anchors: {
    m: {
      b0: number;
      af: number;
      span: number;
      minimumRequiredSpan: number;
      sufficient: boolean;
    };
    rsem: {
      b0: number;
      af: number;
      span: number;
      minimumRequiredSpan: number;
      sufficient: boolean;
    };
  };
  arms: P63V2ArmSelectionSummary[];
  qualifyingInteriorArms: P63ArmLabel[];
  selectionStatus: "selected" | "needs-design-audit";
  selectedBExpose: null | {
    arm: P63ArmLabel;
    budgetTokens: number;
  };
  reasonCodes: string[];
  interpretationBoundary: {
    formalEquivalenceClaimed: false;
    stage1AEffectClaimed: false;
    p63DataReusableForStage1A: false;
  };
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertFiniteUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number in [0,1], got ${value}`);
  }
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function expectedBudgetForArm(arm: P63ArmLabel): number | "full" {
  return arm === "AF" ? "full" : P6_3_V2_FROZEN_BUDGETS[arm];
}

function publicBudgetForArm(arm: P63ArmLabel): number {
  return P6_3_V2_FROZEN_BUDGETS[arm];
}

function assertStateIntegrity(state: P63V2CalibrationState): void {
  if (state.runClass !== "scientific-calibration" || state.calibrationOnly !== true) {
    throw new Error("P6-3 v2 selection requires scientific-calibration provenance");
  }
  if (state.confirmatoryStage1AEligible !== false) {
    throw new Error("P6-3 v2 calibration evidence must remain Stage 1A ineligible");
  }
  if (state.status !== "completed") {
    throw new Error(`P6-3 v2 selection requires completed state, got ${state.status}`);
  }
  if (state.checkoutGitSha !== P6_3_V2_LIVE_SOURCE_CHECKOUT) {
    throw new Error(`unexpected live source checkout: ${state.checkoutGitSha}`);
  }
  if (state.totalLogicalCells !== P6_3_EXPECTED_NORMAL_CALL_COUNT || state.cursorCellIndex !== P6_3_EXPECTED_NORMAL_CALL_COUNT) {
    throw new Error("P6-3 v2 selection requires the complete frozen 864-cell collection");
  }
  if (state.inFlight !== null || state.auditFlag !== null) {
    throw new Error("P6-3 v2 selection refused: unresolved in-flight/audit state");
  }
  if (state.exhaustedCells.length !== 0) {
    throw new Error("P6-3 v2 selection refused: exhausted logical cells present");
  }
}

function finalScientificObservations(state: P63V2CalibrationState): {
  valid: P63V2AttemptRecord[];
  infrastructureInvalid: P63V2AttemptRecord[];
} {
  const infrastructureInvalid = state.attempts.filter(
    (attempt) => attempt.effectiveFailureDomain === "infrastructure"
  );
  const valid = state.attempts.filter(
    (attempt) => attempt.effectiveFailureDomain !== "infrastructure"
  );
  if (valid.length !== P6_3_EXPECTED_NORMAL_CALL_COUNT) {
    throw new Error(
      `expected ${P6_3_EXPECTED_NORMAL_CALL_COUNT} non-infrastructure scientific observations, got ${valid.length}`
    );
  }
  const bySequence = new Map<number, P63V2AttemptRecord[]>();
  for (const attempt of valid) {
    const rows = bySequence.get(attempt.sequence) ?? [];
    rows.push(attempt);
    bySequence.set(attempt.sequence, rows);
  }
  for (let sequence = 0; sequence < P6_3_EXPECTED_NORMAL_CALL_COUNT; sequence += 1) {
    const rows = bySequence.get(sequence) ?? [];
    if (rows.length !== 1) {
      throw new Error(`sequence ${sequence}: expected exactly one valid scientific observation, got ${rows.length}`);
    }
  }
  return { valid, infrastructureInvalid };
}

function assertAttemptFrozenIdentity(attempt: P63V2AttemptRecord): void {
  if (!ARM_ORDER.includes(attempt.armLabel)) {
    throw new Error(`unexpected arm ${attempt.armLabel}`);
  }
  const expectedBudget = expectedBudgetForArm(attempt.armLabel);
  if (attempt.budgetTokens !== expectedBudget) {
    throw new Error(
      `sequence ${attempt.sequence}: ${attempt.armLabel} budget mismatch (${String(attempt.budgetTokens)} != ${String(expectedBudget)})`
    );
  }
  if (attempt.repeat < 1 || attempt.repeat > P6_3_V2_CALIBRATION_REPEATS || !Number.isInteger(attempt.repeat)) {
    throw new Error(`sequence ${attempt.sequence}: invalid repeat ${attempt.repeat}`);
  }
  const expectedKind = attempt.armLabel === "AF" ? "AF" : "EL";
  if (attempt.armKind !== expectedKind) {
    throw new Error(`sequence ${attempt.sequence}: arm kind mismatch for ${attempt.armLabel}`);
  }
}

function buildArmSummaries(valid: readonly P63V2AttemptRecord[]): P63V2ArmSelectionSummary[] {
  const primaryTasks = new Set<string>(P6_2_PRIMARY_TASK_IDS);
  const summaries: P63V2ArmSelectionSummary[] = [];

  const mAll = valid.filter((row) => row.measurement === "M");
  const rAll = valid.filter((row) => row.measurement === "Rsem");
  if (mAll.length !== P6_3_EXPECTED_M_CALL_COUNT || rAll.length !== P6_3_EXPECTED_RSEM_CALL_COUNT) {
    throw new Error(`measurement counts changed: M=${mAll.length}, Rsem=${rAll.length}`);
  }

  for (const row of valid) assertAttemptFrozenIdentity(row);

  for (const arm of ARM_ORDER) {
    const mRows = mAll.filter((row) => row.armLabel === arm);
    const rRows = rAll.filter((row) => row.armLabel === arm);
    const expectedM = P6_2_PRIMARY_TASK_IDS.length * P6_3_V2_CALIBRATION_REPEATS;
    const expectedR = P6_3_V2_CALIBRATION_REPEATS;
    if (mRows.length !== expectedM || rRows.length !== expectedR) {
      throw new Error(`${arm}: unexpected observation count M=${mRows.length}, Rsem=${rRows.length}`);
    }

    const mRepeatMeans: MRepeatSummary[] = [];
    let mPassCount = 0;
    for (let repeat = 1; repeat <= P6_3_V2_CALIBRATION_REPEATS; repeat += 1) {
      const rows = mRows.filter((row) => row.repeat === repeat);
      if (rows.length !== P6_2_PRIMARY_TASK_IDS.length) {
        throw new Error(`${arm} M repeat ${repeat}: expected ${P6_2_PRIMARY_TASK_IDS.length} task outcomes, got ${rows.length}`);
      }
      const seenTasks = rows.map((row) => row.taskId).sort();
      const expectedTasks = [...P6_2_PRIMARY_TASK_IDS].sort();
      if (JSON.stringify(seenTasks) !== JSON.stringify(expectedTasks)) {
        throw new Error(`${arm} M repeat ${repeat}: primary task membership mismatch`);
      }
      let repeatPasses = 0;
      for (const row of rows) {
        if (row.taskId === null || !primaryTasks.has(row.taskId)) {
          throw new Error(`${arm} M repeat ${repeat}: unexpected task ${String(row.taskId)}`);
        }
        if (typeof row.passed !== "boolean") {
          throw new Error(`${arm} M repeat ${repeat}: missing boolean passed outcome`);
        }
        const expectedScore = row.passed ? 1 : 0;
        if (row.semanticScore === null || !nearlyEqual(row.semanticScore, expectedScore)) {
          throw new Error(`${arm} M repeat ${repeat}: passed/semanticScore mismatch`);
        }
        if (row.passed) repeatPasses += 1;
      }
      mPassCount += repeatPasses;
      mRepeatMeans.push({
        repeat,
        passCount: repeatPasses,
        total: rows.length,
        mean: repeatPasses / rows.length,
      });
    }

    const rsemRepeatMeans: RSemRepeatSummary[] = [];
    let rsemCorrect = 0;
    let rsemTotal = 0;
    for (let repeat = 1; repeat <= P6_3_V2_CALIBRATION_REPEATS; repeat += 1) {
      const rows = rRows.filter((row) => row.repeat === repeat);
      if (rows.length !== 1) {
        throw new Error(`${arm} Rsem repeat ${repeat}: expected one bank-level outcome, got ${rows.length}`);
      }
      const row = rows[0];
      if (row.taskId !== null || row.passed !== null) {
        throw new Error(`${arm} Rsem repeat ${repeat}: Rsem identity fields changed`);
      }
      if (row.semanticScore === null) {
        throw new Error(`${arm} Rsem repeat ${repeat}: semanticScore is missing`);
      }
      assertFiniteUnitInterval(row.semanticScore, `${arm} Rsem repeat ${repeat} semanticScore`);
      const correct = row.diagnosticSummary.booleanCorrect;
      const total = row.diagnosticSummary.booleanTotal;
      if (!Number.isInteger(correct) || !Number.isInteger(total) || total !== P6_2_RSEM_PRIMARY_PROBE_COUNT) {
        throw new Error(`${arm} Rsem repeat ${repeat}: invalid 12-probe diagnostic counts`);
      }
      const correctNumber = correct as number;
      const totalNumber = total as number;
      if (correctNumber < 0 || correctNumber > totalNumber) {
        throw new Error(`${arm} Rsem repeat ${repeat}: booleanCorrect out of range`);
      }
      if (!nearlyEqual(row.semanticScore, correctNumber / totalNumber)) {
        throw new Error(`${arm} Rsem repeat ${repeat}: semanticScore does not match booleanCorrect/booleanTotal`);
      }
      rsemCorrect += correctNumber;
      rsemTotal += totalNumber;
      rsemRepeatMeans.push({
        repeat,
        correct: correctNumber,
        total: totalNumber,
        mean: row.semanticScore,
        protocolValid: row.protocolValid,
      });
    }

    summaries.push({
      arm,
      budgetTokens: publicBudgetForArm(arm),
      m: {
        observations: mRows.length,
        passCount: mPassCount,
        mean: mPassCount / mRows.length,
        repeatMeans: mRepeatMeans,
      },
      rsem: {
        observations: rRows.length,
        correct: rsemCorrect,
        total: rsemTotal,
        mean: rsemCorrect / rsemTotal,
        repeatMeans: rsemRepeatMeans,
      },
      gate: null,
    });
  }
  return summaries;
}

function findArm(arms: P63V2ArmSelectionSummary[], label: P63ArmLabel): P63V2ArmSelectionSummary {
  const found = arms.find((arm) => arm.arm === label);
  if (!found) throw new Error(`missing arm ${label}`);
  return found;
}

export function analyzeP63V2Selection(state: P63V2CalibrationState): P63V2SelectionAnalysis {
  assertStateIntegrity(state);
  const { valid, infrastructureInvalid } = finalScientificObservations(state);
  const arms = buildArmSummaries(valid);
  const b0 = findArm(arms, "B0");
  const af = findArm(arms, "AF");

  const mObservationsPerArm = P6_2_PRIMARY_TASK_IDS.length * P6_3_V2_CALIBRATION_REPEATS;
  const rsemObservationsPerArm = P6_3_V2_CALIBRATION_REPEATS;
  const rsemProbeJudgmentsPerArm = rsemObservationsPerArm * P6_2_RSEM_PRIMARY_PROBE_COUNT;
  const mDeltaUnits = mObservationsPerArm * P6_2_DELTA_M;
  const rsemDeltaUnits = rsemProbeJudgmentsPerArm * P6_2_DELTA_R;
  if (!Number.isInteger(mDeltaUnits) || !Number.isInteger(rsemDeltaUnits)) {
    throw new Error("frozen point-estimate margins no longer map to integer calibration units");
  }

  const mSpanUnits = af.m.passCount - b0.m.passCount;
  const rsemSpanUnits = af.rsem.correct - b0.rsem.correct;
  const mAnchorSufficient = mSpanUnits >= 2 * mDeltaUnits;
  const rsemAnchorSufficient = rsemSpanUnits >= 2 * rsemDeltaUnits;

  for (const label of INTERIOR_ARMS) {
    const arm = findArm(arms, label);
    const mAboveB0Units = arm.m.passCount - b0.m.passCount;
    const mBelowAfUnits = af.m.passCount - arm.m.passCount;
    const rsemAboveB0Units = arm.rsem.correct - b0.rsem.correct;
    const rsemBelowAfUnits = af.rsem.correct - arm.rsem.correct;
    const mPassesPointGuard = mAboveB0Units >= mDeltaUnits && mBelowAfUnits >= mDeltaUnits;
    const rsemPassesPointGuard = rsemAboveB0Units >= rsemDeltaUnits && rsemBelowAfUnits >= rsemDeltaUnits;
    arm.gate = {
      mAboveB0Units,
      mBelowAfUnits,
      rsemAboveB0Units,
      rsemBelowAfUnits,
      mPassesPointGuard,
      rsemPassesPointGuard,
      conjunctiveCandidate: mPassesPointGuard && rsemPassesPointGuard,
    };
  }

  const qualifyingInteriorArms = INTERIOR_ARMS.filter((label) => {
    const gate = findArm(arms, label).gate;
    return gate?.conjunctiveCandidate === true;
  });
  const reasonCodes: string[] = [];
  if (!mAnchorSufficient) reasonCodes.push("M_ANCHOR_SPAN_LT_2_DELTA");
  if (!rsemAnchorSufficient) reasonCodes.push("RSEM_ANCHOR_SPAN_LT_2_DELTA");
  if (qualifyingInteriorArms.length === 0) reasonCodes.push("NO_CONJUNCTIVE_INTERIOR_BUDGET");

  const selectionAllowed = mAnchorSufficient && rsemAnchorSufficient && qualifyingInteriorArms.length > 0;
  const selectedArm = selectionAllowed ? qualifyingInteriorArms[0] : null;

  return {
    schemaVersion: P6_3_V2_SELECTION_ANALYSIS_SCHEMA,
    runClass: "scientific-calibration",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    source: {
      repoPath: P6_3_V2_LIVE_EVIDENCE_REPO_PATH,
      sha256: P6_3_V2_LIVE_EVIDENCE_SHA256,
      liveCheckoutGitSha: P6_3_V2_LIVE_SOURCE_CHECKOUT,
      statePlanHash: state.planHash,
    },
    integrity: {
      stateStatus: state.status,
      totalLogicalCells: state.totalLogicalCells,
      validScientificObservations: valid.length,
      committedAttempts: state.attempts.length,
      infrastructureInvalidCommittedAttempts: infrastructureInvalid.length,
      interruptedAttempts: state.interruptedAttempts.length,
      exhaustedLogicalCells: state.exhaustedCells.length,
      unresolvedAuditFlag: state.auditFlag !== null,
    },
    frozenRule: {
      calibrationRepeats: P6_3_V2_CALIBRATION_REPEATS,
      primaryMTasks: P6_2_PRIMARY_TASK_IDS.length,
      rsemPrimaryProbes: P6_2_RSEM_PRIMARY_PROBE_COUNT,
      deltaM: P6_2_DELTA_M,
      deltaR: P6_2_DELTA_R,
      mObservationsPerArm,
      rsemObservationsPerArm,
      rsemProbeJudgmentsPerArm,
      mDeltaUnits,
      rsemDeltaUnits,
      tieBreak: "smallest-qualifying-interior-budget",
    },
    anchors: {
      m: {
        b0: b0.m.mean,
        af: af.m.mean,
        span: af.m.mean - b0.m.mean,
        minimumRequiredSpan: 2 * P6_2_DELTA_M,
        sufficient: mAnchorSufficient,
      },
      rsem: {
        b0: b0.rsem.mean,
        af: af.rsem.mean,
        span: af.rsem.mean - b0.rsem.mean,
        minimumRequiredSpan: 2 * P6_2_DELTA_R,
        sufficient: rsemAnchorSufficient,
      },
    },
    arms,
    qualifyingInteriorArms: [...qualifyingInteriorArms],
    selectionStatus: selectionAllowed ? "selected" : "needs-design-audit",
    selectedBExpose: selectedArm === null
      ? null
      : { arm: selectedArm, budgetTokens: publicBudgetForArm(selectedArm) },
    reasonCodes,
    interpretationBoundary: {
      formalEquivalenceClaimed: false,
      stage1AEffectClaimed: false,
      p63DataReusableForStage1A: false,
    },
  };
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const statePath = path.resolve(repoRoot, P6_3_V2_LIVE_EVIDENCE_REPO_PATH);
  if (!fs.existsSync(statePath)) {
    throw new Error(`P6-3 v2 evidence not found: ${statePath}`);
  }
  const actualHash = sha256File(statePath);
  if (actualHash !== P6_3_V2_LIVE_EVIDENCE_SHA256) {
    throw new Error(`P6-3 v2 evidence SHA-256 mismatch: ${actualHash}`);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as P63V2CalibrationState;
  const result = analyzeP63V2Selection(state);
  const output = JSON.stringify(result, null, 2) + "\n";
  const outputPath = process.env.P6_3_V2_SELECTION_OUTPUT;
  if (outputPath) {
    const target = path.resolve(repoRoot, outputPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output, "utf8");
  }
  process.stdout.write(output);
}

if (require.main === module) main();
