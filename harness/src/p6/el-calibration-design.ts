import { P6_2_DELTA_M, P6_2_DELTA_R } from "./af-baseline";

export const P6_3_EL_CALIBRATION_DESIGN_VERSION =
  "p6-3-el-calibration-v1-static-prefix-six-level" as const;
export const P6_3_CALIBRATION_REPEAT_COUNT = 12;
export const P6_3_MAX_ATTEMPTS_PER_LOGICAL_CELL = 3;

export const P6_3_FINITE_BUDGET_FRACTIONS = [
  0,
  1 / 8,
  1 / 4,
  1 / 2,
  3 / 4,
] as const;

/**
 * Outcome-independent structural search space for ArtifactUnit granularity.
 * The largest candidate satisfying all nested/distinct dose gates is frozen.
 * No live outcome may change this candidate list or its descending preference.
 */
export const P6_3_MAX_TOKENS_PER_UNIT_CANDIDATES = [
  512,
  384,
  256,
  192,
  128,
  96,
  64,
] as const;

export type P63FiniteBudgetLabel = "B0" | "B1" | "B2" | "B3" | "B4";
export type P63BudgetLabel = P63FiniteBudgetLabel | "AF";

export interface P63BudgetGrid {
  fullPayloadTokens: number;
  finite: Array<{
    label: P63FiniteBudgetLabel;
    fraction: number;
    nominalTokens: number;
  }>;
  labels: P63BudgetLabel[];
}

export function buildP63BudgetGrid(fullPayloadTokens: number): P63BudgetGrid {
  if (!Number.isInteger(fullPayloadTokens) || fullPayloadTokens <= 0) {
    throw new Error(`P6-3 T_EL must be a positive integer, got ${fullPayloadTokens}`);
  }
  const labels: P63FiniteBudgetLabel[] = ["B0", "B1", "B2", "B3", "B4"];
  const finite = P6_3_FINITE_BUDGET_FRACTIONS.map((fraction, index) => ({
    label: labels[index],
    fraction,
    // Deterministic rounding rule frozen before live calibration.
    nominalTokens: Math.floor(fullPayloadTokens * fraction),
  }));
  const tokens = finite.map((entry) => entry.nominalTokens);
  for (let index = 1; index < tokens.length; index++) {
    if (tokens[index] <= tokens[index - 1]) {
      throw new Error(
        `P6-3 finite nominal budgets collapsed after floor rounding: ${tokens.join(",")}`
      );
    }
  }
  if (finite[finite.length - 1].nominalTokens >= fullPayloadTokens) {
    throw new Error("P6-3 B4 must remain strictly below AF/T_EL");
  }
  return {
    fullPayloadTokens,
    finite,
    labels: [...labels, "AF"],
  };
}

export function p63BudgetOrderForRepeat(repeat: number): P63BudgetLabel[] {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > P6_3_CALIBRATION_REPEAT_COUNT) {
    throw new Error(`Invalid P6-3 calibration repeat: ${repeat}`);
  }
  const forward: P63BudgetLabel[] = ["B0", "B1", "B2", "B3", "B4", "AF"];
  const reverse = [...forward].reverse() as P63BudgetLabel[];
  const base = repeat <= 6 ? forward : reverse;
  const offset = (repeat - 1) % 6;
  return [...base.slice(offset), ...base.slice(0, offset)];
}

export function assertP63Counterbalance(): void {
  const labels: P63BudgetLabel[] = ["B0", "B1", "B2", "B3", "B4", "AF"];
  for (let position = 0; position < 6; position++) {
    for (const label of labels) {
      const count = Array.from({ length: P6_3_CALIBRATION_REPEAT_COUNT }, (_, index) =>
        p63BudgetOrderForRepeat(index + 1)[position]
      ).filter((value) => value === label).length;
      if (count !== 2) {
        throw new Error(
          `P6-3 counterbalance mismatch: label=${label} position=${position} count=${count}`
        );
      }
    }
  }
}

export interface P63CalibrationAnchorMeans {
  M0: number;
  MAF: number;
  R0: number;
  RAF: number;
}

export interface P63InternalBudgetMeans {
  label: Exclude<P63FiniteBudgetLabel, "B0">;
  nominalTokens: number;
  M: number;
  R: number;
}

export interface P63BudgetSelectionResult {
  status: "selected" | "needs-design-audit";
  selected: P63InternalBudgetMeans | null;
  reason: string;
  qualifyingLabels: string[];
}

/**
 * Predeclared point-estimate selection guard. This is not TOST/equivalence.
 */
export function selectP63ExposureBudget(
  anchors: P63CalibrationAnchorMeans,
  candidates: readonly P63InternalBudgetMeans[]
): P63BudgetSelectionResult {
  for (const [key, value] of Object.entries(anchors)) {
    assertRate(value, key);
  }
  for (const candidate of candidates) {
    assertRate(candidate.M, `${candidate.label}.M`);
    assertRate(candidate.R, `${candidate.label}.R`);
  }

  if (anchors.MAF - anchors.M0 < 2 * P6_2_DELTA_M) {
    return {
      status: "needs-design-audit",
      selected: null,
      reason: "M anchor gap is smaller than 2*Delta_M; no predeclared interior exists",
      qualifyingLabels: [],
    };
  }
  if (anchors.RAF - anchors.R0 < 2 * P6_2_DELTA_R) {
    return {
      status: "needs-design-audit",
      selected: null,
      reason: "Rsem anchor gap is smaller than 2*Delta_R; no predeclared interior exists",
      qualifyingLabels: [],
    };
  }

  const qualifying = [...candidates]
    .filter((candidate) =>
      candidate.M >= anchors.M0 + P6_2_DELTA_M &&
      candidate.M <= anchors.MAF - P6_2_DELTA_M &&
      candidate.R >= anchors.R0 + P6_2_DELTA_R &&
      candidate.R <= anchors.RAF - P6_2_DELTA_R
    )
    .sort((a, b) => a.nominalTokens - b.nominalTokens);

  if (qualifying.length === 0) {
    return {
      status: "needs-design-audit",
      selected: null,
      reason: "No internal budget satisfies the conjunctive M/Rsem non-degenerate guard",
      qualifyingLabels: [],
    };
  }

  return {
    status: "selected",
    selected: qualifying[0],
    reason: "Selected smallest nominal B_expose satisfying both predeclared endpoint guards",
    qualifyingLabels: qualifying.map((candidate) => candidate.label),
  };
}

function assertRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`P6-3 ${label} must be a finite rate in [0,1], got ${value}`);
  }
}
