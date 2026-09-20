import {
  classifyFailure,
  P6_1_FAILURE_CLASSIFICATION_VERSION,
  type FailureClassification,
  type FailureDomain,
  type TaskRepeatLike,
} from "./failure-classification";
import { P6_1_EXPECTED_TASK_BANK_SIZE, P6_1_TASK_BANK_VERSION } from "./task-bank-eligibility";

export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v3-equivalence-freeze";
export const P6_2_TASK_BANK_VERSION = P6_1_TASK_BANK_VERSION;
export const P6_2_FAILURE_CLASSIFICATION_VERSION = P6_1_FAILURE_CLASSIFICATION_VERSION;

export const P6_2_PRIMARY_TASK_IDS = [
  "T-local-2",
  "T-crosscut-1",
  "T-delayed-1",
  "T-local-3",
  "T-local-4",
  "T-local-5",
  "T-local-6",
  "T-local-7",
  "T-crosscut-3",
  "T-crosscut-4",
  "T-crosscut-5",
  "T-delayed-2",
] as const;

export const P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS = [
  "T-invariant-stress-1",
  "T-invariant-stress-3",
] as const;

export const P6_2_SEMANTIC_FLOOR_TASK_IDS = [
  "T-local-1",
  "T-crosscut-2",
  "T-invariant-stress-2",
  "T-invariant-stress-4",
  "T-invariant-stress-5",
  "T-crosscut-6",
] as const;

export const P6_2_MEASURED_TASK_IDS = [
  ...P6_2_PRIMARY_TASK_IDS,
  ...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
] as const;

// P6-2 pre-live equivalence design. These values are frozen before any AF
// baseline/variance result is observed. One full primary task/probe (1/12) is
// the smallest difference that is considered substantively meaningful; the
// equivalence interval is therefore open at +/- 1/12.
export const P6_2_EQUIVALENCE_DESIGN_VERSION = "p6-2-equivalence-v1";
export const P6_2_RSEM_PRIMARY_PROBE_COUNT = 12;
export const P6_2_DELTA_M = 1 / P6_2_PRIMARY_TASK_IDS.length;
export const P6_2_DELTA_R = 1 / P6_2_RSEM_PRIMARY_PROBE_COUNT;
export const P6_2_EQUIVALENCE_ALPHA = 0.05;
export const P6_2_EQUIVALENCE_CI_LEVEL = 0.90;
export const P6_2_EQUIVALENCE_TARGET_POWER = 0.80;
export const P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS = 8;
export const P6_2_VARIANCE_SD_UCB_CONFIDENCE = 0.95;
export const P6_2_MIN_SCIENTIFIC_REPEATS = 8;
export const P6_2_MAX_SCIENTIFIC_REPEATS = 30;
// Remains null until the separate AF-vs-AF variance pilot is completed.
export const P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT: number | null = null;

export type P62TaskRole = "primary" | "diagnostic";

export interface P62TaskIdentity {
  taskId: string;
  type?: string | null;
}

export interface P62TaskSelection<T extends P62TaskIdentity> {
  primary: T[];
  diagnostic: T[];
  measured: T[];
  excludedSemanticFloorTaskIds: string[];
}

export interface P62RepeatPlanItem {
  taskId: string;
  role: P62TaskRole;
  repeat: number;
}

export interface P62MRepeatLike extends TaskRepeatLike, FailureClassification {
  role: P62TaskRole;
}

export interface P62MSummary {
  primary: P62RoleSummary;
  diagnostic: P62RoleSummary;
  failureDomains: Record<FailureDomain, number>;
}

export interface P62RoleSummary {
  taskCount: number;
  totalRepeats: number;
  scientificallyValidRepeats: number;
  infrastructureInvalidRepeats: number;
  systemAuditRepeats: number;
  otherAuditRepeats: number;
  auditExcludedRepeats: number;
  passed: number;
  passRate: number | null;
}

export function selectP62TaskBank<T extends P62TaskIdentity>(tasks: T[]): P62TaskSelection<T> {
  if (P6_2_TASK_BANK_VERSION !== "p6-1-full-task-bank-v3-postflight-coverage") {
    throw new Error(`P6-2 requires postflight task-bank v3, got ${P6_2_TASK_BANK_VERSION}`);
  }
  if (tasks.length !== P6_1_EXPECTED_TASK_BANK_SIZE) {
    throw new Error(`P6-2 expected ${P6_1_EXPECTED_TASK_BANK_SIZE} tasks, got ${tasks.length}`);
  }

  const byId = new Map<string, T>();
  for (const task of tasks) {
    if (byId.has(task.taskId)) throw new Error(`Duplicate taskId in P6-2 task bank: ${task.taskId}`);
    byId.set(task.taskId, task);
  }

  const expectedPartition = [
    ...P6_2_PRIMARY_TASK_IDS,
    ...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
    ...P6_2_SEMANTIC_FLOOR_TASK_IDS,
  ];
  const partitionSet = new Set<string>(expectedPartition);
  if (partitionSet.size !== P6_1_EXPECTED_TASK_BANK_SIZE) {
    throw new Error("P6-2 frozen task partition contains duplicate IDs");
  }
  const missing = expectedPartition.filter((taskId) => !byId.has(taskId));
  const unexpected = [...byId.keys()].filter((taskId) => !partitionSet.has(taskId));
  if (missing.length || unexpected.length) {
    throw new Error(
      `P6-2 frozen task partition mismatch: missing=[${missing.join(",")}], unexpected=[${unexpected.join(",")}]`
    );
  }

  const primary = P6_2_PRIMARY_TASK_IDS.map((taskId) => byId.get(taskId)!);
  const diagnostic = P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS.map((taskId) => byId.get(taskId)!);
  const measured = [...primary, ...diagnostic];
  const measuredIds = new Set(measured.map((task) => task.taskId));
  for (const floorTaskId of P6_2_SEMANTIC_FLOOR_TASK_IDS) {
    if (measuredIds.has(floorTaskId)) throw new Error(`Semantic-floor task leaked into P6-2 measured bank: ${floorTaskId}`);
  }

  return {
    primary,
    diagnostic,
    measured,
    excludedSemanticFloorTaskIds: [...P6_2_SEMANTIC_FLOOR_TASK_IDS],
  };
}

export function roleForP62Task(taskId: string): P62TaskRole {
  if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes(taskId)) return "primary";
  if ((P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS as readonly string[]).includes(taskId)) return "diagnostic";
  throw new Error(`Task is not measured in P6-2: ${taskId}`);
}

export function validateP62RepeatCount(repeats: number): number {
  if (!Number.isInteger(repeats) || repeats <= 0) {
    throw new Error(`P6-2 repeat count must be a positive integer, got ${repeats}`);
  }
  return repeats;
}

export function planP62MRepeats<T extends P62TaskIdentity>(
  selection: P62TaskSelection<T>,
  repeats: number,
  completed: Array<{ taskId: string; repeat: number }> = []
): P62RepeatPlanItem[] {
  validateP62RepeatCount(repeats);
  const completedKeys = new Set(completed.map((item) => `${item.taskId}#${item.repeat}`));
  const plan: P62RepeatPlanItem[] = [];
  for (const task of selection.measured) {
    const role = roleForP62Task(task.taskId);
    for (let repeat = 1; repeat <= repeats; repeat++) {
      if (!completedKeys.has(`${task.taskId}#${repeat}`)) plan.push({ taskId: task.taskId, role, repeat });
    }
  }
  return plan;
}

export function planP62ProbeRepeats(
  repeats: number,
  completed: Array<{ repeat: number }> = []
): number[] {
  validateP62RepeatCount(repeats);
  const done = new Set(completed.map((item) => item.repeat));
  const plan: number[] = [];
  for (let repeat = 1; repeat <= repeats; repeat++) if (!done.has(repeat)) plan.push(repeat);
  return plan;
}

export function classifyP62MRepeat<T extends TaskRepeatLike>(
  result: T,
  role = roleForP62Task(result.taskId)
): T & FailureClassification & { role: P62TaskRole } {
  return { ...result, ...classifyFailure(result), role };
}

export type P62MOutcomeDisposition = "score" | "needs-audit";

export function p62MOutcomeDisposition(failureDomain: FailureDomain): P62MOutcomeDisposition {
  // M is an end-to-end modification outcome. Semantic and protocol failures
  // both mean the requested modification was not successfully completed and
  // therefore remain scientific failures (0) in the M denominator. System,
  // infrastructure, and unclassified failures are not silently converted into
  // capability failures; they require adjudication first.
  if (failureDomain === "none" || failureDomain === "semantic" || failureDomain === "protocol") return "score";
  return "needs-audit";
}

export function summarizeP62M(results: P62MRepeatLike[]): P62MSummary {
  const summarizeRole = (role: P62TaskRole): P62RoleSummary => {
    const subset = results.filter((item) => item.role === role);
    const ids = new Set(subset.map((item) => item.taskId));
    const scientificallyValid = subset.filter((item) => p62MOutcomeDisposition(item.failureDomain) === "score");
    const passed = scientificallyValid.filter((item) => item.passed).length;
    const infrastructureInvalidRepeats = subset.filter((item) => item.failureDomain === "infrastructure").length;
    const systemAuditRepeats = subset.filter((item) => item.failureDomain === "system").length;
    const otherAuditRepeats = subset.filter((item) => item.failureDomain === "other").length;
    return {
      taskCount: ids.size,
      totalRepeats: subset.length,
      scientificallyValidRepeats: scientificallyValid.length,
      infrastructureInvalidRepeats,
      systemAuditRepeats,
      otherAuditRepeats,
      auditExcludedRepeats: infrastructureInvalidRepeats + systemAuditRepeats + otherAuditRepeats,
      passed,
      passRate: scientificallyValid.length ? passed / scientificallyValid.length : null,
    };
  };
  const failureDomains: Record<FailureDomain, number> = {
    none: 0,
    semantic: 0,
    protocol: 0,
    system: 0,
    infrastructure: 0,
    other: 0,
  };
  for (const item of results) failureDomains[item.failureDomain] += 1;
  return {
    primary: summarizeRole("primary"),
    diagnostic: summarizeRole("diagnostic"),
    failureDomains,
  };
}
