import type { P61TaskClassification } from "./failure-classification";

export const P6_1_TASK_BANK_VERSION = "p6-1-full-task-bank-v1";
export const P6_1_EXPECTED_TASK_BANK_SIZE = 20;
export const P6_1_REPEATS = 3;

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

export const P6_1_FROZEN_PILOT_CHALLENGE = [
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
  challenge: string[];
  hold: string[];
  invalid: string[];
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
  repeats = P6_1_REPEATS
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
  repeats = P6_1_REPEATS
): RepeatIdentity[] {
  const planned = plannedRepeats(tasks, repeats);
  const completedKeys = new Set(completed.map(repeatKey));
  return planned.filter((item) => !completedKeys.has(repeatKey(item)));
}

export function buildCombinedEligibilityBank(
  classifications: P61TaskClassification[],
  pilotPrimary: readonly string[] = P6_1_FROZEN_PILOT_PRIMARY,
  pilotChallenge: readonly string[] = P6_1_FROZEN_PILOT_CHALLENGE
): EligibilityBankSets {
  const primary = [...pilotPrimary];
  const challenge = [...pilotChallenge];
  const hold: string[] = [];
  const invalid: string[] = [];

  for (const classification of classifications) {
    switch (classification.classification) {
      case "T_primary-eligible":
        primary.push(classification.taskId);
        break;
      case "T_challenge-semantic-floor":
        challenge.push(classification.taskId);
        break;
      case "invalid-capability-classification":
        invalid.push(classification.taskId);
        break;
      default:
        hold.push(classification.taskId);
        break;
    }
  }

  assertUniqueAcrossSets({ primary, challenge, hold, invalid });
  return {
    primary,
    challenge,
    hold,
    invalid,
    freezeReady: hold.length === 0 && invalid.length === 0,
  };
}

function assertUniqueAcrossSets(sets: Omit<EligibilityBankSets, "freezeReady">): void {
  const seen = new Map<string, string>();
  for (const [setName, taskIds] of Object.entries(sets)) {
    for (const taskId of taskIds) {
      const prior = seen.get(taskId);
      if (prior) throw new Error(`Task ${taskId} appears in both ${prior} and ${setName}`);
      seen.set(taskId, setName);
    }
  }
}
