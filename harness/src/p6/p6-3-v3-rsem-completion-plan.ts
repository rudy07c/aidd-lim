import * as crypto from "crypto";
import {
  buildP63V3CalibrationPlan,
  type P63V3CalibrationCell,
} from "./p6-3-v3-calibration-runner";
import {
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
} from "./p6-3-v3-rsem-completion-predeclaration";

export const P6_3_V3_RSEM_COMPLETION_PLAN_VERSION =
  "p6-3-v3-rsem-completion-plan-v1" as const;

export interface P63V3RSemCompletionCell {
  readonly collectionSequence: number;
  readonly canonicalV3Sequence: number;
  readonly measurement: "Rsem";
  readonly taskId: null;
  readonly repeat: number;
  readonly blockKey: string;
  readonly armLabel: P63V3CalibrationCell["armLabel"];
  readonly armKind: P63V3CalibrationCell["armKind"];
  readonly budgetTokens: P63V3CalibrationCell["budgetTokens"];
}

export function buildP63V3RSemCompletionPlan():
  readonly P63V3RSemCompletionCell[] {
  const canonical = buildP63V3CalibrationPlan().filter(
    (cell) => cell.measurement === "Rsem"
  );
  if (
    canonical.length !==
    P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS
  ) {
    throw new Error(
      `P6-3 v3 fresh Rsem plan expected 72 cells, got ${canonical.length}`
    );
  }

  const plan = canonical.map((cell, collectionSequence) => {
    if (
      cell.taskId !== null ||
      cell.sequence !== 792 + collectionSequence
    ) {
      throw new Error(
        `P6-3 v3 fresh Rsem canonical identity drift at collection sequence ${collectionSequence}`
      );
    }
    return Object.freeze({
      collectionSequence,
      canonicalV3Sequence: cell.sequence,
      measurement: "Rsem" as const,
      taskId: null,
      repeat: cell.repeat,
      blockKey: cell.blockKey,
      armLabel: cell.armLabel,
      armKind: cell.armKind,
      budgetTokens: cell.budgetTokens,
    });
  });

  const armCounts = new Map<string, number>();
  for (const cell of plan) {
    armCounts.set(
      cell.armLabel,
      (armCounts.get(cell.armLabel) ?? 0) + 1
    );
  }
  for (const arm of ["B0", "B1", "B2", "B3", "B4", "AF"] as const) {
    if (armCounts.get(arm) !== 12) {
      throw new Error(
        `P6-3 v3 fresh Rsem plan arm ${arm} expected 12 cells, got ${String(armCounts.get(arm))}`
      );
    }
  }

  return Object.freeze(plan);
}

export function p63V3RSemCompletionPlanHash(
  plan: readonly P63V3RSemCompletionCell[] =
    buildP63V3RSemCompletionPlan()
): string {
  return crypto
    .createHash("sha256")
    .update(
      stableJson({
        predeclarationVersion:
          P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
        planVersion: P6_3_V3_RSEM_COMPLETION_PLAN_VERSION,
        cells: plan,
      }),
      "utf8"
    )
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson(record[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
