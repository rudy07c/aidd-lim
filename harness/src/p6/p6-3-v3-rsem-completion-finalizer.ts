import * as crypto from "crypto";
import {
  P6_3_V3_ARTIFACT_BUDGETS,
  P6_3_V3_CALIBRATION_PREDECLARATION,
  P6_3_V3_DELTA_M,
  P6_3_V3_DELTA_R,
  selectP63V3ArtifactBudget,
  type P63V3ArmAggregate,
  type P63V3ArmLabel,
  type P63V3BudgetSelectionDecision,
} from "./p6-3-v3-calibration-predeclaration";
import {
  loadP63V3InheritedMEvidence,
  type P63V3InheritedMEvidence,
} from "./p6-3-v3-inherited-m-evidence";
import type { P63V3AttemptRecord } from "./p6-3-v3-live-controller";
import {
  P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION,
  P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA,
  type P63V3RSemCompletionAttemptRecord,
  type P63V3RSemCompletionState,
} from "./p6-3-v3-rsem-completion-controller";
import {
  buildP63V3RSemCompletionPlan,
  p63V3RSemCompletionPlanHash,
  type P63V3RSemCompletionCell,
} from "./p6-3-v3-rsem-completion-plan";
import {
  P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
} from "./p6-3-v3-rsem-completion-predeclaration";

export const P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION =
  "p6-3-v3-rsem-completion-finalizer-v1" as const;
export const P6_3_V3_RSEM_COMPLETION_RESULT_SCHEMA =
  "p6-3-v3-rsem-completion-result-v1" as const;

const ARM_ORDER: readonly P63V3ArmLabel[] = Object.freeze([
  "B0",
  "B1",
  "B2",
  "B3",
  "B4",
  "AF",
]);
const EPSILON = 1e-12;

export interface P63V3RSemCompletionMRepeatSummary {
  readonly repeat: number;
  readonly passCount: number;
  readonly total: number;
  readonly mean: number;
}

export interface P63V3RSemCompletionRSemRepeatSummary {
  readonly repeat: number;
  readonly correct: number;
  readonly total: number;
  readonly mean: number;
}

export interface P63V3RSemCompletionArmSummary {
  readonly arm: P63V3ArmLabel;
  readonly budgetTokens: number;
  readonly m: {
    readonly observations: number;
    readonly passCount: number;
    readonly total: number;
    readonly mean: number;
    readonly repeatMeans:
      readonly P63V3RSemCompletionMRepeatSummary[];
  };
  readonly rsem: {
    readonly observations: number;
    readonly correct: number;
    readonly total: number;
    readonly mean: number;
    readonly repeatMeans:
      readonly P63V3RSemCompletionRSemRepeatSummary[];
  };
}

export interface P63V3RSemCompletionFinalizationResult {
  readonly schemaVersion:
    typeof P6_3_V3_RSEM_COMPLETION_RESULT_SCHEMA;
  readonly finalizerVersion:
    typeof P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION;
  readonly runClass: "scientific-calibration-completion";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly source: {
    readonly inheritedM: {
      readonly sourceStateSha256: string;
      readonly mEvidenceSemanticSha256: string;
      readonly sourceCheckoutGitSha: string;
      readonly sourcePlanHash: string;
      readonly sourceTreatmentProvenanceHash: string;
      readonly fixedEnvironmentIdentity: string;
    };
    readonly freshRSem: {
      readonly stateSemanticSha256: string;
      readonly stateSchemaVersion:
        typeof P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA;
      readonly controllerVersion:
        typeof P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION;
      readonly checkoutGitSha: string;
      readonly planHash: string;
      readonly provenanceHash: string;
      readonly fixedEnvironmentIdentity: string;
      readonly executionMode: "provider-scientific";
      readonly authorizationDigest: string;
    };
    readonly combinedEvidenceSemanticSha256: string;
  };
  readonly integrity: {
    readonly combinedLogicalCells: 864;
    readonly inheritedMValidObservations: 792;
    readonly freshRSemValidObservations: 72;
    readonly freshRSemCommittedAttempts: number;
    readonly freshRSemInfrastructureInvalidCommittedAttempts: number;
    readonly freshRSemInterruptedAttempts: number;
    readonly freshRSemInterruptedAttemptsAdjudicatedInfrastructureInvalid: number;
    readonly unresolvedAuditFlag: false;
  };
  readonly frozenRule: {
    readonly repeatCount: number;
    readonly primaryMTasks: number;
    readonly rsemPrimaryProbes: number;
    readonly mObservationsPerArm: number;
    readonly rsemBankObservationsPerArm: number;
    readonly rsemProbeJudgmentsPerArm: number;
    readonly deltaM: number;
    readonly deltaR: number;
    readonly aggregateM: string;
    readonly aggregateRSem: string;
    readonly selectionRule: string;
    readonly tieBreak: string;
  };
  readonly arms:
    readonly P63V3RSemCompletionArmSummary[];
  readonly selection: P63V3BudgetSelectionDecision;
  readonly interpretationBoundary: {
    readonly splitProvenanceAnalysis: true;
    readonly singleRuntimeInvocationClaimed: false;
    readonly stoppedV3RSemPooled: false;
    readonly reliabilityAuditPooled: false;
    readonly historicalV2PrimaryEstimatePooled: false;
    readonly formalEquivalenceClaimed: false;
    readonly stage1AEffectClaimed: false;
  };
}

export function finalizeP63V3RSemCompletion(args: {
  repoRoot: string;
  freshRSemState:
    Readonly<P63V3RSemCompletionState>;
}): Readonly<P63V3RSemCompletionFinalizationResult> {
  const inheritedM =
    loadP63V3InheritedMEvidence(args.repoRoot);
  const plan = buildP63V3RSemCompletionPlan();
  assertFreshRSemTerminalState(
    args.freshRSemState,
    plan
  );
  assertFreshRSemJournalIntegrity(
    args.freshRSemState,
    plan
  );

  const invalidCommitted =
    args.freshRSemState.attempts.filter(
      (attempt) =>
        attempt.effectiveValidity ===
        "infrastructure-invalid"
    );
  for (const attempt of invalidCommitted) {
    if (
      attempt.infrastructureAdjudication !==
        "infrastructure-invalid" ||
      attempt.adjudication?.finalDisposition !==
        "infrastructure-invalid"
    ) {
      throw new Error(
        `P6-3 v3 split finalization refused: collection sequence ${attempt.collectionSequence} attempt ${attempt.attempt} is infrastructure-invalid without completed adjudication`
      );
    }
  }

  const validRSem =
    args.freshRSemState.attempts.filter(
      (attempt) =>
        attempt.effectiveValidity === "valid"
    );
  if (
    validRSem.length !==
    P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS
  ) {
    throw new Error(
      `P6-3 v3 split finalization refused: expected 72 final valid fresh Rsem observations, got ${validRSem.length}`
    );
  }
  const rsemByCollectionSequence =
    exactlyOneValidRSemPerCollectionSequence(
      validRSem,
      plan
    );
  const arms = buildArmSummaries(
    inheritedM,
    rsemByCollectionSequence
  );
  const aggregates: P63V3ArmAggregate[] =
    arms.map((arm) =>
      Object.freeze({
        label: arm.arm,
        mRate: arm.m.mean,
        rsemRate: arm.rsem.mean,
      })
    );
  const selection =
    selectP63V3ArtifactBudget(aggregates);

  const freshStateSemanticSha256 = sha256Text(
    stableJson(args.freshRSemState)
  );
  const combinedEvidenceSemanticSha256 =
    sha256Text(
      stableJson({
        inheritedMSourceStateSha256:
          inheritedM.sourceStateSha256,
        inheritedMSemanticSha256:
          inheritedM.mEvidenceSemanticSha256,
        freshRSemStateSemanticSha256:
          freshStateSemanticSha256,
      })
    );

  return deepFreeze({
    schemaVersion:
      P6_3_V3_RSEM_COMPLETION_RESULT_SCHEMA,
    finalizerVersion:
      P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION,
    runClass: "scientific-calibration-completion",
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    source: {
      inheritedM: {
        sourceStateSha256:
          inheritedM.sourceStateSha256,
        mEvidenceSemanticSha256:
          inheritedM.mEvidenceSemanticSha256,
        sourceCheckoutGitSha:
          inheritedM.sourceCheckoutGitSha,
        sourcePlanHash: inheritedM.sourcePlanHash,
        sourceTreatmentProvenanceHash:
          inheritedM.sourceTreatmentProvenanceHash,
        fixedEnvironmentIdentity:
          inheritedM.fixedEnvironmentIdentity,
      },
      freshRSem: {
        stateSemanticSha256:
          freshStateSemanticSha256,
        stateSchemaVersion:
          args.freshRSemState.schemaVersion,
        controllerVersion:
          args.freshRSemState.controllerVersion,
        checkoutGitSha:
          args.freshRSemState.checkoutGitSha,
        planHash: args.freshRSemState.planHash,
        provenanceHash:
          args.freshRSemState.provenanceHash,
        fixedEnvironmentIdentity:
          args.freshRSemState
            .fixedEnvironmentIdentity,
        executionMode: "provider-scientific",
        authorizationDigest:
          args.freshRSemState.authorizationDigest,
      },
      combinedEvidenceSemanticSha256,
    },
    integrity: {
      combinedLogicalCells:
        P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
      inheritedMValidObservations:
        P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
      freshRSemValidObservations:
        P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
      freshRSemCommittedAttempts:
        args.freshRSemState.attempts.length,
      freshRSemInfrastructureInvalidCommittedAttempts:
        invalidCommitted.length,
      freshRSemInterruptedAttempts:
        args.freshRSemState.interruptedAttempts
          .length,
      freshRSemInterruptedAttemptsAdjudicatedInfrastructureInvalid:
        args.freshRSemState.interruptedAttempts.filter(
          (attempt) =>
            attempt.adjudication
              ?.finalDisposition ===
            "infrastructure-invalid"
        ).length,
      unresolvedAuditFlag: false,
    },
    frozenRule: {
      repeatCount:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .execution.repeatCount,
      primaryMTasks:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .measurements.M.primaryTaskCount,
      rsemPrimaryProbes:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .measurements.Rsem
          .booleanProbeCount,
      mObservationsPerArm:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .measurements.M.primaryTaskCount *
        P6_3_V3_CALIBRATION_PREDECLARATION
          .execution.repeatCount,
      rsemBankObservationsPerArm:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .execution.repeatCount,
      rsemProbeJudgmentsPerArm:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .measurements.Rsem
          .booleanProbeCount *
        P6_3_V3_CALIBRATION_PREDECLARATION
          .execution.repeatCount,
      deltaM: P6_3_V3_DELTA_M,
      deltaR: P6_3_V3_DELTA_R,
      aggregateM:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .measurements.M.aggregate,
      aggregateRSem:
        P6_3_V3_CALIBRATION_PREDECLARATION
          .measurements.Rsem.aggregate,
      selectionRule:
        P6_3_V3_RSEM_COMPLETION_PREDECLARATION
          .combinedAnalysis.selectionRule,
      tieBreak:
        P6_3_V3_RSEM_COMPLETION_PREDECLARATION
          .combinedAnalysis.tieBreak,
    },
    arms: Object.freeze(arms),
    selection,
    interpretationBoundary: {
      splitProvenanceAnalysis: true,
      singleRuntimeInvocationClaimed: false,
      stoppedV3RSemPooled: false,
      reliabilityAuditPooled: false,
      historicalV2PrimaryEstimatePooled: false,
      formalEquivalenceClaimed: false,
      stage1AEffectClaimed: false,
    },
  });
}

function assertFreshRSemTerminalState(
  state: Readonly<P63V3RSemCompletionState>,
  plan: readonly P63V3RSemCompletionCell[]
): void {
  if (
    state.schemaVersion !==
      P6_3_V3_RSEM_COMPLETION_STATE_SCHEMA ||
    state.controllerVersion !==
      P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION ||
    state.runClass !==
      "scientific-calibration-completion" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false ||
    state.executionMode !== "provider-scientific"
  ) {
    throw new Error(
      "P6-3 v3 split finalization refused: fresh Rsem state/controller provenance mismatch"
    );
  }
  if (
    state.status !== "completed" ||
    state.cursorCollectionSequence !==
      plan.length ||
    state.totalLogicalCells !== plan.length ||
    state.inFlight !== null ||
    state.auditFlag !== null ||
    state.completedAt === null
  ) {
    throw new Error(
      "P6-3 v3 split finalization refused: fresh Rsem collection is not terminally completed and audit-free"
    );
  }
  if (
    state.planHash !==
      p63V3RSemCompletionPlanHash(plan)
  ) {
    throw new Error(
      "P6-3 v3 split finalization refused: fresh Rsem plan hash differs from frozen completion plan"
    );
  }
  if (
    state.fixedEnvironmentIdentity !==
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY ||
    state.inheritedMSourceStateSha256 !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256 ||
    state.inheritedMSemanticSha256 !==
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256
  ) {
    throw new Error(
      "P6-3 v3 split finalization refused: inherited-M/fixed-environment binding drift"
    );
  }
  for (const [label, value] of [
    ["checkoutGitSha", state.checkoutGitSha],
    ["provenanceHash", state.provenanceHash],
    ["authorizationDigest", state.authorizationDigest],
  ] as const) {
    if (!value || typeof value !== "string") {
      throw new Error(
        `P6-3 v3 split finalization refused: missing fresh Rsem ${label}`
      );
    }
  }
  for (const interrupted of state.interruptedAttempts) {
    if (
      interrupted.adjudication
        ?.finalDisposition !==
      "infrastructure-invalid"
    ) {
      throw new Error(
        `P6-3 v3 split finalization refused: interrupted collection sequence ${interrupted.collectionSequence} attempt ${interrupted.attempt} lacks infrastructure-invalid adjudication`
      );
    }
  }
}

function assertFreshRSemJournalIntegrity(
  state: Readonly<P63V3RSemCompletionState>,
  plan: readonly P63V3RSemCompletionCell[]
): void {
  const bySequence = new Map<
    number,
    Array<{
      attempt: number;
      validity:
        | "valid"
        | "infrastructure-invalid";
      kind: "committed" | "interrupted";
    }>
  >();

  for (const attempt of state.attempts) {
    if (
      attempt.effectiveValidity !== "valid" &&
      attempt.effectiveValidity !==
        "infrastructure-invalid"
    ) {
      throw new Error(
        `P6-3 v3 split finalization refused: malformed fresh Rsem validity at collection sequence ${attempt.collectionSequence}`
      );
    }
    const cell =
      plan[attempt.collectionSequence];
    if (!cell) {
      throw new Error(
        `P6-3 v3 split finalization refused: fresh Rsem collection sequence out of range ${attempt.collectionSequence}`
      );
    }
    assertRSemAttemptMatchesCell(attempt, cell);
    if (!attempt.artifactPath) {
      throw new Error(
        `P6-3 v3 split finalization refused: committed fresh Rsem sequence ${attempt.collectionSequence} attempt ${attempt.attempt} has no artifact path`
      );
    }
    const rows =
      bySequence.get(attempt.collectionSequence) ??
      [];
    rows.push({
      attempt: attempt.attempt,
      validity: attempt.effectiveValidity,
      kind: "committed",
    });
    bySequence.set(
      attempt.collectionSequence,
      rows
    );
  }

  for (const interrupted of state.interruptedAttempts) {
    const cell =
      plan[interrupted.collectionSequence];
    if (
      !cell ||
      interrupted.canonicalV3Sequence !==
        cell.canonicalV3Sequence
    ) {
      throw new Error(
        `P6-3 v3 split finalization refused: interrupted fresh Rsem identity drift at collection sequence ${interrupted.collectionSequence}`
      );
    }
    const rows =
      bySequence.get(
        interrupted.collectionSequence
      ) ?? [];
    rows.push({
      attempt: interrupted.attempt,
      validity: "infrastructure-invalid",
      kind: "interrupted",
    });
    bySequence.set(
      interrupted.collectionSequence,
      rows
    );
  }

  for (
    let collectionSequence = 0;
    collectionSequence < plan.length;
    collectionSequence += 1
  ) {
    const rows = (
      bySequence.get(collectionSequence) ?? []
    ).sort(
      (left, right) =>
        left.attempt - right.attempt
    );
    if (rows.length === 0) {
      throw new Error(
        `P6-3 v3 split finalization refused: collection sequence ${collectionSequence} has no attempt journal`
      );
    }
    for (
      let index = 0;
      index < rows.length;
      index += 1
    ) {
      if (
        rows[index].attempt !== index + 1 ||
        rows[index].attempt >
          P6_3_V3_RSEM_COMPLETION_PREDECLARATION
            .freshRSem
            .maxScientificAttemptsPerLogicalCell
      ) {
        throw new Error(
          `P6-3 v3 split finalization refused: collection sequence ${collectionSequence} attempt journal is non-contiguous, duplicated, or exceeds the frozen ceiling`
        );
      }
    }
    const validRows = rows.filter(
      (row) => row.validity === "valid"
    );
    if (validRows.length !== 1) {
      throw new Error(
        `P6-3 v3 split finalization refused: collection sequence ${collectionSequence} expected exactly one valid observation, got ${validRows.length}`
      );
    }
    if (
      validRows[0].attempt !==
      rows[rows.length - 1].attempt
    ) {
      throw new Error(
        `P6-3 v3 split finalization refused: collection sequence ${collectionSequence} has attempts after its final valid observation`
      );
    }
  }
}

function exactlyOneValidRSemPerCollectionSequence(
  valid: readonly P63V3RSemCompletionAttemptRecord[],
  plan: readonly P63V3RSemCompletionCell[]
): readonly P63V3RSemCompletionAttemptRecord[] {
  const bySequence = new Map<
    number,
    P63V3RSemCompletionAttemptRecord[]
  >();
  for (const attempt of valid) {
    const rows =
      bySequence.get(attempt.collectionSequence) ??
      [];
    rows.push(attempt);
    bySequence.set(
      attempt.collectionSequence,
      rows
    );
  }
  const result:
    P63V3RSemCompletionAttemptRecord[] = [];
  for (
    let collectionSequence = 0;
    collectionSequence < plan.length;
    collectionSequence += 1
  ) {
    const rows =
      bySequence.get(collectionSequence) ?? [];
    if (rows.length !== 1) {
      throw new Error(
        `P6-3 v3 split finalization refused: collection sequence ${collectionSequence} expected exactly one final fresh Rsem observation, got ${rows.length}`
      );
    }
    result.push(rows[0]);
  }
  return Object.freeze(result);
}

function assertRSemAttemptMatchesCell(
  attempt: Readonly<P63V3RSemCompletionAttemptRecord>,
  cell: Readonly<P63V3RSemCompletionCell>
): void {
  if (
    attempt.collectionSequence !==
      cell.collectionSequence ||
    attempt.canonicalV3Sequence !==
      cell.canonicalV3Sequence ||
    attempt.repeat !== cell.repeat ||
    attempt.armLabel !== cell.armLabel ||
    attempt.armKind !== cell.armKind ||
    attempt.budgetTokens !== cell.budgetTokens
  ) {
    throw new Error(
      `P6-3 v3 split finalization refused: fresh Rsem attempt identity drift at collection sequence ${cell.collectionSequence}`
    );
  }
}

function buildArmSummaries(
  inheritedM:
    Readonly<P63V3InheritedMEvidence>,
  validRSem:
    readonly P63V3RSemCompletionAttemptRecord[]
): P63V3RSemCompletionArmSummary[] {
  const primaryTasks = [
    ...P6_3_V3_CALIBRATION_PREDECLARATION
      .measurements.M.primaryTaskIds,
  ].sort();
  const summaries:
    P63V3RSemCompletionArmSummary[] = [];

  for (const arm of ARM_ORDER) {
    const mRows = inheritedM.rows.filter(
      (row) => row.armLabel === arm
    );
    const rRows = validRSem.filter(
      (row) => row.armLabel === arm
    );
    const expectedM =
      P6_3_V3_CALIBRATION_PREDECLARATION
        .measurements.M.primaryTaskCount *
      P6_3_V3_CALIBRATION_PREDECLARATION
        .execution.repeatCount;
    const expectedR =
      P6_3_V3_CALIBRATION_PREDECLARATION
        .execution.repeatCount;
    if (
      mRows.length !== expectedM ||
      rRows.length !== expectedR
    ) {
      throw new Error(
        `P6-3 v3 split finalization refused: ${arm} observation count mismatch M=${mRows.length}, Rsem=${rRows.length}`
      );
    }

    const mRepeatMeans:
      P63V3RSemCompletionMRepeatSummary[] = [];
    let mPassCount = 0;
    for (
      let repeat = 1;
      repeat <=
      P6_3_V3_CALIBRATION_PREDECLARATION
        .execution.repeatCount;
      repeat += 1
    ) {
      const rows = mRows.filter(
        (row) => row.repeat === repeat
      );
      if (rows.length !== primaryTasks.length) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} inherited M repeat ${repeat} task count drift`
        );
      }
      const tasks = rows
        .map((row) => row.taskId ?? "")
        .sort();
      if (
        JSON.stringify(tasks) !==
        JSON.stringify(primaryTasks)
      ) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} inherited M repeat ${repeat} task membership drift`
        );
      }
      let repeatPasses = 0;
      for (const row of rows) {
        assertMOutcome(row, arm, repeat);
        if (row.passed) repeatPasses += 1;
      }
      mPassCount += repeatPasses;
      mRepeatMeans.push(
        Object.freeze({
          repeat,
          passCount: repeatPasses,
          total: rows.length,
          mean:
            repeatPasses / rows.length,
        })
      );
    }

    const rsemRepeatMeans:
      P63V3RSemCompletionRSemRepeatSummary[] =
      [];
    let rsemCorrect = 0;
    let rsemTotal = 0;
    for (
      let repeat = 1;
      repeat <=
      P6_3_V3_CALIBRATION_PREDECLARATION
        .execution.repeatCount;
      repeat += 1
    ) {
      const rows = rRows.filter(
        (row) => row.repeat === repeat
      );
      if (rows.length !== 1) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} fresh Rsem repeat ${repeat} expected one bank observation, got ${rows.length}`
        );
      }
      const row = rows[0];
      if (
        row.semanticScore === null ||
        !Number.isFinite(row.semanticScore) ||
        row.protocolValid !== true
      ) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} fresh Rsem repeat ${repeat} lacks a protocol-valid semantic score`
        );
      }
      const correct =
        row.diagnosticSummary.booleanCorrect;
      const total =
        row.diagnosticSummary.booleanTotal;
      if (
        !Number.isInteger(correct) ||
        !Number.isInteger(total) ||
        total !==
          P6_3_V3_CALIBRATION_PREDECLARATION
            .measurements.Rsem
            .booleanProbeCount
      ) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} fresh Rsem repeat ${repeat} probe denominator/count drift`
        );
      }
      const correctNumber = correct as number;
      const totalNumber = total as number;
      if (
        correctNumber < 0 ||
        correctNumber > totalNumber
      ) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} fresh Rsem repeat ${repeat} booleanCorrect out of range`
        );
      }
      const rate =
        correctNumber / totalNumber;
      if (
        !nearlyEqual(
          row.semanticScore,
          rate
        )
      ) {
        throw new Error(
          `P6-3 v3 split finalization refused: ${arm} fresh Rsem repeat ${repeat} semanticScore does not match booleanCorrect/booleanTotal`
        );
      }
      rsemCorrect += correctNumber;
      rsemTotal += totalNumber;
      rsemRepeatMeans.push(
        Object.freeze({
          repeat,
          correct: correctNumber,
          total: totalNumber,
          mean: rate,
        })
      );
    }

    const expectedRsemTotal =
      P6_3_V3_CALIBRATION_PREDECLARATION
        .execution.repeatCount *
      P6_3_V3_CALIBRATION_PREDECLARATION
        .measurements.Rsem
        .booleanProbeCount;
    if (rsemTotal !== expectedRsemTotal) {
      throw new Error(
        `P6-3 v3 split finalization refused: ${arm} fresh Rsem total denominator drift ${rsemTotal} != ${expectedRsemTotal}`
      );
    }

    summaries.push(
      deepFreeze({
        arm,
        budgetTokens:
          P6_3_V3_ARTIFACT_BUDGETS[arm],
        m: {
          observations: mRows.length,
          passCount: mPassCount,
          total: mRows.length,
          mean:
            mPassCount / mRows.length,
          repeatMeans: mRepeatMeans,
        },
        rsem: {
          observations: rRows.length,
          correct: rsemCorrect,
          total: rsemTotal,
          mean: rsemCorrect / rsemTotal,
          repeatMeans: rsemRepeatMeans,
        },
      })
    );
  }
  return summaries;
}

function assertMOutcome(
  row: Readonly<P63V3AttemptRecord>,
  arm: P63V3ArmLabel,
  repeat: number
): void {
  if (
    row.measurement !== "M" ||
    typeof row.passed !== "boolean" ||
    row.semanticScore === null ||
    !nearlyEqual(
      row.semanticScore,
      row.passed ? 1 : 0
    )
  ) {
    throw new Error(
      `P6-3 v3 split finalization refused: ${arm} inherited M repeat ${repeat} pass/score drift`
    );
  }
}

function nearlyEqual(
  left: number,
  right: number
): boolean {
  return Math.abs(left - right) <= EPSILON;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>
      )
        .sort(([left], [right]) =>
          left.localeCompare(right)
        )
        .map(([key, item]) => [
          key,
          sortJson(item),
        ])
    );
  }
  return value;
}

function sha256Text(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const item of Object.values(
      value as Record<string, unknown>
    )) {
      deepFreeze(item);
    }
  }
  return value;
}
