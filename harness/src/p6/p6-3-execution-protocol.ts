export const P6_3_CALIBRATION_REPEAT_COUNT = 12 as const;
export const P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL = 3 as const;
export const P6_3_EXECUTION_PROTOCOL_VERSION = "p6-3-execution-protocol-v1" as const;

export type P63ELBudgetLabel = "B0" | "B1" | "B2" | "B3" | "B4";

export interface P63ELArm {
  readonly kind: "EL";
  readonly label: P63ELBudgetLabel;
}

export interface P63AFArm {
  readonly kind: "AF";
  readonly label: "AF";
}

export type P63CalibrationArm = P63ELArm | P63AFArm;
export type P63ScheduleDirection = "forward" | "reverse";

export interface P63ScheduledRepeat {
  readonly repeat: number;
  readonly direction: P63ScheduleDirection;
  readonly rotationOffset: number;
  readonly arms: readonly P63CalibrationArm[];
}

export const P6_3_FORWARD_BASE_ORDER: readonly P63CalibrationArm[] = Object.freeze([
  Object.freeze({ kind: "EL", label: "B0" as const }),
  Object.freeze({ kind: "EL", label: "B1" as const }),
  Object.freeze({ kind: "EL", label: "B2" as const }),
  Object.freeze({ kind: "EL", label: "B3" as const }),
  Object.freeze({ kind: "EL", label: "B4" as const }),
  Object.freeze({ kind: "AF", label: "AF" as const }),
]);

export const P6_3_REVERSE_BASE_ORDER: readonly P63CalibrationArm[] = Object.freeze([
  Object.freeze({ kind: "AF", label: "AF" as const }),
  Object.freeze({ kind: "EL", label: "B4" as const }),
  Object.freeze({ kind: "EL", label: "B3" as const }),
  Object.freeze({ kind: "EL", label: "B2" as const }),
  Object.freeze({ kind: "EL", label: "B1" as const }),
  Object.freeze({ kind: "EL", label: "B0" as const }),
]);

export function buildP63CalibrationSchedule(): readonly P63ScheduledRepeat[] {
  const schedule: P63ScheduledRepeat[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    schedule.push(Object.freeze({
      repeat: offset + 1,
      direction: "forward",
      rotationOffset: offset,
      arms: Object.freeze(rotateLeft(P6_3_FORWARD_BASE_ORDER, offset)),
    }));
  }
  for (let offset = 0; offset < 6; offset += 1) {
    schedule.push(Object.freeze({
      repeat: offset + 7,
      direction: "reverse",
      rotationOffset: offset,
      arms: Object.freeze(rotateLeft(P6_3_REVERSE_BASE_ORDER, offset)),
    }));
  }
  return Object.freeze(schedule);
}

export function dispatchP63Arm<T>(
  arm: P63CalibrationArm,
  handlers: {
    runEL: (arm: P63ELArm) => T;
    runAF: (arm: P63AFArm) => T;
  }
): T {
  assertP63CalibrationArm(arm);
  if (arm.kind === "EL") return handlers.runEL(arm);
  return handlers.runAF(arm);
}

export function assertP63CalibrationArm(value: unknown): asserts value is P63CalibrationArm {
  if (!value || typeof value !== "object") throw new Error("P6-3 arm must be an object");
  const arm = value as { kind?: unknown; label?: unknown };
  if (arm.kind === "AF") {
    if (arm.label !== "AF") throw new Error("P6-3 AF arm must have label AF");
    return;
  }
  if (arm.kind === "EL") {
    if (!["B0", "B1", "B2", "B3", "B4"].includes(String(arm.label))) {
      throw new Error(`P6-3 EL arm has invalid budget label: ${String(arm.label)}`);
    }
    return;
  }
  throw new Error(`P6-3 arm has invalid kind: ${String(arm.kind)}`);
}

export type P63ScientificFailureDomain = "none" | "semantic" | "protocol" | "system";
export type P63AttemptFailureDomain = P63ScientificFailureDomain | "infrastructure";
export type P63InfrastructureAdjudication = "not-applicable" | "pending" | "infrastructure-invalid";
export type P63AttemptTransition = "advance-next-arm" | "retry-same-cell" | "stop-needs-audit";

export interface P63AttemptState {
  readonly attempt: number;
  readonly failureDomain: P63AttemptFailureDomain;
  readonly infrastructureAdjudication: P63InfrastructureAdjudication;
}

export function decideP63AttemptTransition(state: P63AttemptState): P63AttemptTransition {
  if (!Number.isInteger(state.attempt) || state.attempt < 1 || state.attempt > P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL) {
    throw new Error(
      `P6-3 attempt must be an integer from 1 to ${P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL}; got ${state.attempt}`
    );
  }

  if (state.failureDomain !== "infrastructure") {
    if (state.infrastructureAdjudication !== "not-applicable") {
      throw new Error("P6-3 non-infrastructure scientific outcomes must not carry infrastructure adjudication");
    }
    return "advance-next-arm";
  }

  if (state.infrastructureAdjudication !== "infrastructure-invalid") {
    return "stop-needs-audit";
  }

  if (state.attempt < P6_3_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL) {
    return "retry-same-cell";
  }
  return "stop-needs-audit";
}

function rotateLeft<T>(items: readonly T[], offset: number): T[] {
  if (items.length === 0) return [];
  const normalized = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}
