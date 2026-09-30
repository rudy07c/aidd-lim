import {
  GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
  GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
} from "../context/generation-zero-fixed-environment";
import {
  WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION,
} from "../context/fixed-environment-runtime";
import {
  P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
} from "../context/p6-3-v3-final-static-exposure-selector";
import {
  P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
} from "../context/p6-3-v3-selector-structural-acceptance";
import { P6_2_PRIMARY_TASK_IDS } from "./af-baseline";
import {
  P6_3_CALIBRATION_REPEAT_COUNT,
  P6_3_EXECUTION_PROTOCOL_VERSION,
} from "./p6-3-execution-protocol";
import { P6_3_V3_M_EXECUTOR_VERSION } from "./p6-3-v3-m-executor";
import { P6_3_V3_RSEM_EXECUTOR_VERSION } from "./p6-3-v3-rsem-executor";
import { P6_3_V3_RUN_START_WIRING_VERSION } from "./p6-3-v3-run-start";

export const P6_3_V3_CALIBRATION_PREDECLARATION_VERSION =
  "p6-3-v3-calibration-predeclaration-v1" as const;
export const P6_3_V3_ARTIFACT_CHUNK_MAX_TOKENS = 256 as const;
export const P6_3_V3_FULL_ARTIFACT_TOKENS = 4046 as const;
export const P6_3_V3_RSEM_NAMING_SCHEME_ID = "A-obfuscated" as const;
export const P6_3_V3_RSEM_PROBE_COUNT = 12 as const;
export const P6_3_V3_DELTA_M = 1 / 11;
export const P6_3_V3_DELTA_R = 1 / 12;

export type P63V3ArmLabel = "B0" | "B1" | "B2" | "B3" | "B4" | "AF";
export type P63V3InteriorArmLabel = Exclude<P63V3ArmLabel, "B0" | "AF">;

export const P6_3_V3_ARTIFACT_BUDGETS = Object.freeze({
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: P6_3_V3_FULL_ARTIFACT_TOKENS,
} as const);

export const P6_3_V3_INTERIOR_ARM_ORDER: readonly P63V3InteriorArmLabel[] =
  Object.freeze(["B1", "B2", "B3", "B4"]);

/**
 * Complete pre-live scientific design freeze for P6-3 v3 calibration.
 *
 * Deliberately unchanged from the pre-v3 measurement design:
 * - primary M task bank;
 * - 12-probe Rsem bank;
 * - 12-repeat balanced execution schedule;
 * - historical capacity grid;
 * - Delta_M / Delta_R margins;
 * - conjunctive co-gate and minimum-budget tie-break.
 *
 * The v3 treatment correction is isolated to the already-frozen E_fixed boundary
 * and final artifact selector. No observed v2 outcome is an input here.
 */
export const P6_3_V3_CALIBRATION_PREDECLARATION = Object.freeze({
  version: P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
  purpose: "EL-artifact-capacity-calibration-only",
  contextDefinition: "E_fixed union Exposure_artifact(B_expose, S_select)",
  historicalV2OutcomeUse: "not-an-input-to-grid-margins-or-selection-rule",
  historicalV2PrimaryEstimatePooling: false,
  budgetGridOrigin: "reuse-v2-capacity-grid-unchanged-to-avoid-post-hoc-retuning",
  artifactBudgets: P6_3_V3_ARTIFACT_BUDGETS,
  fullArtifactTokens: P6_3_V3_FULL_ARTIFACT_TOKENS,
  artifactChunkMaxTokens: P6_3_V3_ARTIFACT_CHUNK_MAX_TOKENS,
  b0Meaning: "zero-artifact-evidence-with-common-E_fixed-present",
  afMeaning: "full-artifact-evidence-with-the-same-common-E_fixed-present",
  selector: Object.freeze({
    policyVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
    acceptanceSpecVersion: P6_3_V3_SELECTOR_STRUCTURAL_ACCEPTANCE_SPEC_VERSION,
    structurallyFrozen: true,
  }),
  fixedEnvironment: Object.freeze({
    policyVersion: WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION,
    generationZeroBuilderVersion: GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
    repositorySerializerVersion: GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
    runStartWiringVersion: P6_3_V3_RUN_START_WIRING_VERSION,
    chargedToArtifactBudget: false,
    oneBindingPerRun: true,
    identicalAcrossArmsMeasurementsAndRepeats: true,
  }),
  measurements: Object.freeze({
    M: Object.freeze({
      primaryTaskIds: Object.freeze([...P6_2_PRIMARY_TASK_IDS]),
      primaryTaskCount: P6_2_PRIMARY_TASK_IDS.length,
      margin: P6_3_V3_DELTA_M,
      executorVersion: P6_3_V3_M_EXECUTOR_VERSION,
      aggregate: "mean-binary-pass-rate-across-primary-tasks-and-repeats",
    }),
    Rsem: Object.freeze({
      namingSchemeId: P6_3_V3_RSEM_NAMING_SCHEME_ID,
      booleanProbeCount: P6_3_V3_RSEM_PROBE_COUNT,
      margin: P6_3_V3_DELTA_R,
      executorVersion: P6_3_V3_RSEM_EXECUTOR_VERSION,
      aggregate: "mean-semantic-score-across-repeats-equivalent-to-probe-judgment-rate",
    }),
  }),
  execution: Object.freeze({
    repeatCount: P6_3_CALIBRATION_REPEAT_COUNT,
    scheduleVersion: P6_3_EXECUTION_PROTOCOL_VERSION,
    armLabels: Object.freeze(["B0", "B1", "B2", "B3", "B4", "AF"] as const),
    expectedMLogicalCells:
      P6_2_PRIMARY_TASK_IDS.length * P6_3_CALIBRATION_REPEAT_COUNT * 6,
    expectedRSemLogicalCells: P6_3_CALIBRATION_REPEAT_COUNT * 6,
    expectedTotalLogicalCells:
      (P6_2_PRIMARY_TASK_IDS.length + 1) * P6_3_CALIBRATION_REPEAT_COUNT * 6,
  }),
  selection: Object.freeze({
    rule: "conjunctive-interior-co-gate",
    mLowerGuard: "M(B) - M(B0) >= Delta_M",
    mUpperGuard: "M(AF) - M(B) >= Delta_M",
    rsemLowerGuard: "Rsem(B) - Rsem(B0) >= Delta_R",
    rsemUpperGuard: "Rsem(AF) - Rsem(B) >= Delta_R",
    qualifyingArms: Object.freeze([...P6_3_V3_INTERIOR_ARM_ORDER]),
    multipleQualifiersTieBreak: "minimum-B_expose",
    noQualifierAction: "needs-design-audit",
    noQualifierReason: "NO_CONJUNCTIVE_INTERIOR_BUDGET",
    monotonicDoseResponseRequired: false,
  }),
  liveAuthorization: false,
  confirmatoryStage1AEligible: false,
} as const);

export interface P63V3ArmAggregate {
  readonly label: P63V3ArmLabel;
  readonly mRate: number;
  readonly rsemRate: number;
}

export interface P63V3BudgetSelectionDecision {
  readonly status: "selected" | "needs-design-audit";
  readonly qualifyingInteriorArms: readonly P63V3InteriorArmLabel[];
  readonly selectedArm: P63V3InteriorArmLabel | null;
  readonly selectedBExpose: number | null;
  readonly reason: "CONJUNCTIVE_INTERIOR_BUDGET_SELECTED" | "NO_CONJUNCTIVE_INTERIOR_BUDGET";
}

/** Apply the frozen v3 conjunctive co-gate to already-aggregated scientific rates. */
export function selectP63V3ArtifactBudget(
  aggregates: readonly P63V3ArmAggregate[]
): P63V3BudgetSelectionDecision {
  const byLabel = new Map<P63V3ArmLabel, P63V3ArmAggregate>();
  for (const aggregate of aggregates) {
    if (byLabel.has(aggregate.label)) {
      throw new Error(`duplicate P6-3 v3 aggregate for ${aggregate.label}`);
    }
    assertRate(aggregate.mRate, `${aggregate.label}.mRate`);
    assertRate(aggregate.rsemRate, `${aggregate.label}.rsemRate`);
    byLabel.set(aggregate.label, aggregate);
  }
  for (const label of ["B0", "B1", "B2", "B3", "B4", "AF"] as const) {
    if (!byLabel.has(label)) throw new Error(`missing P6-3 v3 aggregate for ${label}`);
  }
  if (byLabel.size !== 6) throw new Error("P6-3 v3 selection requires exactly six arm aggregates");

  const b0 = byLabel.get("B0")!;
  const af = byLabel.get("AF")!;
  const qualifying = P6_3_V3_INTERIOR_ARM_ORDER.filter((label) => {
    const candidate = byLabel.get(label)!;
    return (
      candidate.mRate - b0.mRate >= P6_3_V3_DELTA_M &&
      af.mRate - candidate.mRate >= P6_3_V3_DELTA_M &&
      candidate.rsemRate - b0.rsemRate >= P6_3_V3_DELTA_R &&
      af.rsemRate - candidate.rsemRate >= P6_3_V3_DELTA_R
    );
  });

  if (qualifying.length === 0) {
    return Object.freeze({
      status: "needs-design-audit",
      qualifyingInteriorArms: Object.freeze([]),
      selectedArm: null,
      selectedBExpose: null,
      reason: "NO_CONJUNCTIVE_INTERIOR_BUDGET",
    });
  }

  const selectedArm = qualifying[0];
  return Object.freeze({
    status: "selected",
    qualifyingInteriorArms: Object.freeze([...qualifying]),
    selectedArm,
    selectedBExpose: P6_3_V3_ARTIFACT_BUDGETS[selectedArm],
    reason: "CONJUNCTIVE_INTERIOR_BUDGET_SELECTED",
  });
}

function assertRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite rate in [0,1]; got ${value}`);
  }
}
