import {
  classifyTaskEligibility,
  DEFAULT_P6_1_ELIGIBILITY_RULE,
  type P61TaskClassification,
  type TaskRepeatLike,
} from "./failure-classification";

export const P6_1_TASK_BANK_VERSION = "p6-1-full-task-bank-v2";
export const P6_1_EXPECTED_TASK_BANK_SIZE = 20;
export const P6_1_INITIAL_REPEATS = DEFAULT_P6_1_ELIGIBILITY_RULE.initialAttempts;
export const P6_1_MAX_ATTEMPTS = DEFAULT_P6_1_ELIGIBILITY_RULE.maxAttempts;
/** Backward-compatible alias for the frozen 3-repeat pilot. */
export const P6_1_REPEATS = P6_1_INITIAL_REPEATS;

export const P6_1_PILOT_TASK_IDS = [
  "T-local-2",
  "T-crosscut-1",
  "T-delayed-1",
  "T-crosscut-2",
  "T-local-1",
] as const;

export const P6_1_FROZEN_PILOT_PRIMARY = [
  "T-local-2",
  "T-crosscut-1",
  "T-delayed-1",
] as const;

export const P6_1_FROZEN_PILOT_SEMANTIC_FLOOR = [
  "T-local-1",
  "T-crosscut-2",
] as const;

export interface TaskIdentity {
  taskId: string;
  type?: string | null;
}

export interface RepeatIdentity {
  taskId: string;
  repeat: number;
}

export interface EligibilityBankSets {
  primary: string[];
  eligibleDiagnostic: string[];
  diagnostic: string[];
  challenge: string[];
  challengeSemanticFloor: string[];
  challengeAfUnstable: string[];
  invalid: string[];
  pending: string[];
  freezeReady: boolean;
}

export function selectRemainingEligibilityTasks<T extends TaskIdentity>(
  tasks: T[],
  pilotTaskIds: readonly string[] = P6_1_PILOT_TASK_IDS
): T[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.taskId)) throw new Error(`Duplicate taskId in task bank: ${task.taskId}`);
    seen.add(task.taskId);
  }

  const missingPilot = pilotTaskIds.filter((taskId) => !seen.has(taskId));
  if (missingPilot.length > 0) {
    throw new Error(`Frozen P6-1 pilot task(s) missing from task bank: ${missingPilot.join(",")}`);
  }

  const excluded = new Set(pilotTaskIds);
  return tasks.filter((task) => !excluded.has(task.taskId));
}

export function plannedRepeats<T extends TaskIdentity>(
  tasks: T[],
  repeats = P6_1_INITIAL_REPEATS
): RepeatIdentity[] {
  if (!Number.isInteger(repeats) || repeats <= 0) throw new Error(`Invalid repeat count: ${repeats}`);
  const plan: RepeatIdentity[] = [];
  for (const task of tasks) {
    for (let repeat = 1; repeat <= repeats; repeat++) plan.push({ taskId: task.taskId, repeat });
  }
  return plan;
}

export function repeatKey(x: RepeatIdentity): string {
  return `${x.taskId}#${x.repeat}`;
}

export function missingRepeatPlan<T extends TaskIdentity>(
  tasks: T[],
  completed: RepeatIdentity[],
  repeats = P6_1_INITIAL_REPEATS
): RepeatIdentity[] {
  const planned = plannedRepeats(tasks, repeats);
  const completedKeys = new Set(completed.map(repeatKey));
  return planned.filter((item) => !completedKeys.has(repeatKey(item)));
}

/**
 * Returns at most one next attempt per task. Calling this repeatedly produces
 * round-robin initial attempts (1..3), then only the predeclared additional
 * attempts (4..5) for tasks that still need semantic evidence.
 */
export function nextEligibilityRepeatPlan<T extends TaskIdentity>(
  tasks: T[],
  completed: TaskRepeatLike[]
): RepeatIdentity[] {
  const plan: RepeatIdentity[] = [];
  for (const task of tasks) {
    const repeats = completed
      .filter((item) => item.taskId === task.taskId)
      .sort((a, b) => a.repeat - b.repeat);
    if (repeats.length >= P6_1_MAX_ATTEMPTS) continue;

    if (repeats.length < P6_1_INITIAL_REPEATS) {
      plan.push({ taskId: task.taskId, repeat: repeats.length + 1 });
      continue;
    }

    const classification = classifyTaskEligibility(repeats, DEFAULT_P6_1_ELIGIBILITY_RULE);
    if (classification.needsAdditionalRepeat) {
      plan.push({ taskId: task.taskId, repeat: repeats.length + 1 });
    }
  }
  return plan;
}

export function buildCombinedEligibilityBank(
  classifications: P61TaskClassification[],
  pilotPrimary: readonly string[] = P6_1_FROZEN_PILOT_PRIMARY,
  pilotSemanticFloor: readonly string[] = P6_1_FROZEN_PILOT_SEMANTIC_FLOOR
): EligibilityBankSets {
  const primary = [...pilotPrimary];
  const eligibleDiagnostic: string[] = [];
  const diagnostic: string[] = [];
  const challengeSemanticFloor = [...pilotSemanticFloor];
  const challengeAfUnstable: string[] = [];
  const invalid: string[] = [];
  const pending: string[] = [];

  for (const item of classifications) {
    if (item.analysisRole === "diagnostic") diagnostic.push(item.taskId);

    switch (item.capabilityClass) {
      case "eligible":
        if (item.analysisRole === "main") primary.push(item.taskId);
        else eligibleDiagnostic.push(item.taskId);
        break;
      case "semantic-floor":
        challengeSemanticFloor.push(item.taskId);
        break;
      case "AF-unstable":
        challengeAfUnstable.push(item.taskId);
        break;
      case "invalid":
        invalid.push(item.taskId);
        break;
      default:
        pending.push(item.taskId);
        break;
    }
  }

  const challenge = [...challengeSemanticFloor, ...challengeAfUnstable];
  assertCapabilitySetsUnique({ primary, eligibleDiagnostic, challenge, invalid, pending });

  return {
    primary,
    eligibleDiagnostic,
    diagnostic,
    challenge,
    challengeSemanticFloor,
    challengeAfUnstable,
    invalid,
    pending,
    freezeReady: pending.length === 0,
  };
}

function assertCapabilitySetsUnique(sets: Record<string, string[]>): void {
  const seen = new Map<string, string>();
  for (const [setName, taskIds] of Object.entries(sets)) {
    for (const taskId of taskIds) {
      const prior = seen.get(taskId);
      if (prior) throw new Error(`Task ${taskId} appears in both ${prior} and ${setName}`);
      seen.set(taskId, setName);
    }
  }
}
