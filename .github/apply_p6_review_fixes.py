from pathlib import Path

ROOT = Path('.')

run_validity = r'''import type { AgentExecutionStatus } from "./types";

export const CENSORED_AGENT_EXECUTION_STATUSES: ReadonlySet<AgentExecutionStatus> = new Set<AgentExecutionStatus>([
  "provider-error",
  "response-failed",
  "response-incomplete",
  "response-not-completed",
  "response-refusal",
]);

export function isCensoredAgentExecutionStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && (CENSORED_AGENT_EXECUTION_STATUSES as ReadonlySet<string>).has(status);
}
'''
(ROOT / 'harness/src/run-validity.ts').write_text(run_validity, encoding='utf-8')

orchestrator_path = ROOT / 'harness/src/orchestrator.ts'
orchestrator = orchestrator_path.read_text(encoding='utf-8')
import_anchor = 'import type { GroundTruthDelta } from "../../synthetic-world/schema";\n'
if 'from "./run-validity"' not in orchestrator:
    orchestrator = orchestrator.replace(import_anchor, import_anchor + 'import { isCensoredAgentExecutionStatus } from "./run-validity";\n')
old_censor = '''const CENSORED_AGENT_STATUSES = new Set<AgentExecutionStatus>([\n  "provider-error",\n  "response-failed",\n  "response-incomplete",\n  "response-not-completed",\n  "response-refusal",\n]);\n\nexport function shouldCensorGeneration(status: AgentExecutionStatus): boolean {\n  return CENSORED_AGENT_STATUSES.has(status);\n}\n'''
new_censor = '''export function shouldCensorGeneration(status: AgentExecutionStatus): boolean {\n  return isCensoredAgentExecutionStatus(status);\n}\n'''
if old_censor not in orchestrator:
    raise SystemExit('orchestrator censor block not found')
orchestrator = orchestrator.replace(old_censor, new_censor)
orchestrator_path.write_text(orchestrator, encoding='utf-8')

failure_classification = r'''import { isCensoredAgentExecutionStatus } from "../run-validity";

export const P6_1_FAILURE_CLASSIFICATION_VERSION = "p6-1-failure-domain-v3";

export type FailureDomain =
  | "none"
  | "semantic"
  | "protocol"
  | "system"
  | "infrastructure"
  | "other";

export type CapabilityClass =
  | "eligible"
  | "semantic-floor"
  | "AF-unstable"
  | "invalid"
  | "pending";

export type AnalysisRole = "main" | "diagnostic";

export interface FailureLike {
  passed: boolean;
  validity?: string | null;
  failureCategory?: string | null;
  failureReason?: string | null;
  executionStatus?: string | null;
}

export interface FailureClassification {
  failureDomain: FailureDomain;
  semanticFailure: boolean;
  protocolFailure: boolean;
  systemFailure: boolean;
  infrastructureFailure: boolean;
}

export const DEFAULT_P6_1_ELIGIBILITY_RULE = {
  primaryMinSemanticSuccesses: 2,
  semanticFloorMinFailures: 2,
  afUnstableMinSemanticFailures: 2,
  invalidInfrastructureMin: 2,
  initialAttempts: 3,
  maxAttempts: 5,
} as const;

export interface TaskRepeatLike extends FailureLike {
  taskId: string;
  taskType?: string | null;
  repeat: number;
}

export interface P61TaskClassification {
  taskId: string;
  taskType: string | null;
  attempts: number;
  semanticSuccesses: number;
  semanticFailures: number;
  semanticEvaluableRepeats: number;
  protocolFailures: number;
  systemFailures: number;
  otherFailures: number;
  infrastructureInvalidCount: number;
  protocolReliabilitySuccesses: number;
  protocolReliabilityTotal: number;
  protocolReliability: number | null;
  capabilityClass: CapabilityClass;
  analysisRole: AnalysisRole;
  needsAdditionalRepeat: boolean;
  decisionReason: string;
  classification: string;
}

const PROTOCOL_CATEGORIES = new Set([
  "output-parse",
  "protocol-contract",
  "mutation-validation",
]);

const PROTOCOL_STATUSES = new Set([
  "output-parse-failure",
  "mutation-validation-failure",
]);

export function classifyFailure(result: FailureLike): FailureClassification {
  if (result.passed) return flags("none");

  const category = result.failureCategory ?? "";
  const status = result.executionStatus ?? "";
  const reason = result.failureReason ?? "";

  if (
    result.validity === "infrastructure-invalid" ||
    category === "provider" ||
    category === "harness" ||
    isCensoredAgentExecutionStatus(status)
  ) {
    return flags("infrastructure");
  }

  if (category === "test-failure") {
    if (reason.includes(":execution:")) return flags("system");
    return flags("semantic");
  }

  if (PROTOCOL_CATEGORIES.has(category) || PROTOCOL_STATUSES.has(status)) {
    return flags("protocol");
  }

  return flags("other");
}

export function analysisRoleForTaskType(taskType: string | null | undefined): AnalysisRole {
  return taskType === "invariant_stressing" ? "diagnostic" : "main";
}

export function classifyTaskEligibility(
  results: TaskRepeatLike[],
  rule: {
    primaryMinSemanticSuccesses: number;
    semanticFloorMinFailures: number;
    afUnstableMinSemanticFailures: number;
    invalidInfrastructureMin: number;
    initialAttempts: number;
    maxAttempts: number;
  } = DEFAULT_P6_1_ELIGIBILITY_RULE
): P61TaskClassification {
  if (!results.length) throw new Error("classifyTaskEligibility requires at least one repeat");
  if (rule.maxAttempts < rule.initialAttempts) throw new Error("maxAttempts must be >= initialAttempts");

  const classified = results.map((result) => ({ result, failure: classifyFailure(result) }));
  const taskId = results[0].taskId;
  const taskType = results[0].taskType ?? null;
  if (results.some((result) => result.taskId !== taskId)) {
    throw new Error("classifyTaskEligibility received mixed task IDs");
  }

  const attempts = results.length;
  const semanticSuccesses = classified.filter(({ result }) => result.passed).length;
  const semanticFailures = classified.filter(({ failure }) => failure.semanticFailure).length;
  const protocolFailures = classified.filter(({ failure }) => failure.protocolFailure).length;
  const systemFailures = classified.filter(({ failure }) => failure.systemFailure).length;
  const infrastructureInvalidCount = classified.filter(({ failure }) => failure.infrastructureFailure).length;
  const otherFailures = classified.filter(({ result, failure }) => !result.passed && failure.failureDomain === "other").length;
  const semanticEvaluableRepeats = semanticSuccesses + semanticFailures;

  const protocolReliabilityTotal = results.length - infrastructureInvalidCount;
  const protocolReliabilitySuccesses = Math.max(0, protocolReliabilityTotal - protocolFailures);
  const protocolReliability = protocolReliabilityTotal > 0
    ? protocolReliabilitySuccesses / protocolReliabilityTotal
    : null;

  let capabilityClass: CapabilityClass = "pending";
  let decisionReason = "initial-attempts-incomplete";

  if (attempts >= rule.initialAttempts) {
    if (infrastructureInvalidCount >= rule.invalidInfrastructureMin) {
      capabilityClass = "invalid";
      decisionReason = "infrastructure-invalid-threshold";
    } else if (semanticSuccesses >= rule.primaryMinSemanticSuccesses) {
      capabilityClass = "eligible";
      decisionReason = "semantic-success-threshold";
    } else if (semanticSuccesses === 0 && semanticFailures >= rule.semanticFloorMinFailures) {
      capabilityClass = "semantic-floor";
      decisionReason = "semantic-floor-threshold";
    } else if (
      semanticSuccesses === 1 &&
      semanticFailures >= rule.afUnstableMinSemanticFailures
    ) {
      capabilityClass = "AF-unstable";
      decisionReason = "one-success-multiple-semantic-failures";
    } else if (attempts >= rule.maxAttempts) {
      if (semanticSuccesses === 1) {
        capabilityClass = "AF-unstable";
        decisionReason = "max-attempts-one-semantic-success";
      } else {
        capabilityClass = "invalid";
        decisionReason = "max-attempts-insufficient-semantic-evidence";
      }
    } else {
      capabilityClass = "pending";
      decisionReason = "additional-semantic-evidence-required";
    }
  }

  const analysisRole = analysisRoleForTaskType(taskType);
  const needsAdditionalRepeat = capabilityClass === "pending" && attempts >= rule.initialAttempts && attempts < rule.maxAttempts;
  const classification = legacyClassification(capabilityClass, analysisRole);

  return {
    taskId,
    taskType,
    attempts,
    semanticSuccesses,
    semanticFailures,
    semanticEvaluableRepeats,
    protocolFailures,
    systemFailures,
    otherFailures,
    infrastructureInvalidCount,
    protocolReliabilitySuccesses,
    protocolReliabilityTotal,
    protocolReliability,
    capabilityClass,
    analysisRole,
    needsAdditionalRepeat,
    decisionReason,
    classification,
  };
}

function legacyClassification(capabilityClass: CapabilityClass, analysisRole: AnalysisRole): string {
  switch (capabilityClass) {
    case "eligible":
      return analysisRole === "main" ? "T_primary-eligible" : "T_diagnostic-eligible";
    case "semantic-floor":
      return "T_challenge-semantic-floor";
    case "AF-unstable":
      return "T_challenge-AF-unstable";
    case "invalid":
      return "invalid-capability-classification";
    default:
      return "hold-more-semantic-repeats";
  }
}

function flags(failureDomain: FailureDomain): FailureClassification {
  return {
    failureDomain,
    semanticFailure: failureDomain === "semantic",
    protocolFailure: failureDomain === "protocol",
    systemFailure: failureDomain === "system",
    infrastructureFailure: failureDomain === "infrastructure",
  };
}
'''
(ROOT / 'harness/src/p6/failure-classification.ts').write_text(failure_classification, encoding='utf-8')

task_bank = r'''import {
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
'''
(ROOT / 'harness/src/p6/task-bank-eligibility.ts').write_text(task_bank, encoding='utf-8')

verify_failure = r'''import assert from "assert";
import {
  classifyFailure,
  classifyTaskEligibility,
  DEFAULT_P6_1_ELIGIBILITY_RULE,
} from "./src/p6/failure-classification";

function repeat(
  taskId: string,
  repeatNo: number,
  passed: boolean,
  failureCategory: string | null = null,
  executionStatus = "ok",
  failureReason: string | null = null,
  validity = "valid",
  taskType?: string
) {
  return {
    taskId,
    taskType: taskType ?? (taskId.startsWith("T-crosscut") ? "cross_cutting" : taskId.startsWith("T-delayed") ? "delayed_dependency" : "local"),
    repeat: repeatNo,
    passed,
    validity,
    failureCategory,
    failureReason,
    executionStatus,
  };
}

assert.equal(classifyFailure(repeat("x", 1, false, "test-failure", "ok", "task-specific: invariant mismatch")).failureDomain, "semantic");
assert.equal(classifyFailure(repeat("x", 1, false, "output-parse", "output-parse-failure", "Duplicate modified file path")).failureDomain, "protocol");
assert.equal(classifyFailure(repeat("x", 1, false, "protocol-contract", "ok", "contract changed")).failureDomain, "protocol");
assert.equal(classifyFailure(repeat("x", 1, false, "test-failure", "ok", "visible:execution:tsc failed")).failureDomain, "system");
assert.equal(classifyFailure(repeat("x", 1, false, "provider", "provider-error", "timeout", "infrastructure-invalid")).failureDomain, "infrastructure");

for (const status of ["response-incomplete", "response-failed", "response-refusal", "response-not-completed"]) {
  const classified = classifyFailure(repeat("x", 1, false, "response", status, status, "valid"));
  assert.equal(classified.failureDomain, "infrastructure", `${status} must be infrastructure`);
  assert.equal(classified.infrastructureFailure, true, `${status} must set infrastructureFailure`);
}

const historicalP61 = [
  repeat("T-local-2", 1, true),
  repeat("T-local-2", 2, false, "output-parse", "output-parse-failure", "Duplicate modified file path: src/vok/rules.ts"),
  repeat("T-local-2", 3, true),

  repeat("T-crosscut-1", 1, true),
  repeat("T-crosscut-1", 2, true),
  repeat("T-crosscut-1", 3, true),

  repeat("T-delayed-1", 1, true),
  repeat("T-delayed-1", 2, true),
  repeat("T-delayed-1", 3, true),

  repeat("T-crosscut-2", 1, false, "test-failure", "ok", "task-specific: invariant guard failure"),
  repeat("T-crosscut-2", 2, false, "test-failure", "ok", "task-specific: state transition failure"),
  repeat("T-crosscut-2", 3, false, "output-parse", "output-parse-failure", "Duplicate modified file path: src/vok/rules.ts"),

  repeat("T-local-1", 1, false, "test-failure", "ok", "task-specific: invariant guard failure"),
  repeat("T-local-1", 2, false, "test-failure", "ok", "task-specific: invariant guard failure"),
  repeat("T-local-1", 3, false, "test-failure", "ok", "task-specific: invariant guard failure"),
];

const byTask = new Map<string, ReturnType<typeof classifyTaskEligibility>>();
for (const taskId of [...new Set(historicalP61.map((r) => r.taskId))]) {
  byTask.set(taskId, classifyTaskEligibility(historicalP61.filter((r) => r.taskId === taskId), DEFAULT_P6_1_ELIGIBILITY_RULE));
}

assert.deepStrictEqual(
  pick(byTask.get("T-local-2")!),
  { semanticSuccesses: 2, semanticFailures: 0, protocolFailures: 1, protocolReliability: 2 / 3, capabilityClass: "eligible", analysisRole: "main", classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-crosscut-1")!),
  { semanticSuccesses: 3, semanticFailures: 0, protocolFailures: 0, protocolReliability: 1, capabilityClass: "eligible", analysisRole: "main", classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-delayed-1")!),
  { semanticSuccesses: 3, semanticFailures: 0, protocolFailures: 0, protocolReliability: 1, capabilityClass: "eligible", analysisRole: "main", classification: "T_primary-eligible" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-crosscut-2")!),
  { semanticSuccesses: 0, semanticFailures: 2, protocolFailures: 1, protocolReliability: 2 / 3, capabilityClass: "semantic-floor", analysisRole: "main", classification: "T_challenge-semantic-floor" }
);
assert.deepStrictEqual(
  pick(byTask.get("T-local-1")!),
  { semanticSuccesses: 0, semanticFailures: 3, protocolFailures: 0, protocolReliability: 1, capabilityClass: "semantic-floor", analysisRole: "main", classification: "T_challenge-semantic-floor" }
);

const unstable = classifyTaskEligibility([
  repeat("T-unstable", 1, true),
  repeat("T-unstable", 2, false, "test-failure", "ok", "task-specific: mismatch"),
  repeat("T-unstable", 3, false, "test-failure", "ok", "task-specific: mismatch"),
]);
assert.equal(unstable.capabilityClass, "AF-unstable");
assert.equal(unstable.needsAdditionalRepeat, false);

const pendingAtThree = classifyTaskEligibility([
  repeat("T-pending", 1, true),
  repeat("T-pending", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
]);
assert.equal(pendingAtThree.capabilityClass, "pending");
assert.equal(pendingAtThree.needsAdditionalRepeat, true);

const unstableAtMax = classifyTaskEligibility([
  repeat("T-pending", 1, true),
  repeat("T-pending", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
  repeat("T-pending", 4, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", 5, false, "test-failure", "ok", "hidden:execution:tsc failed"),
]);
assert.equal(unstableAtMax.capabilityClass, "AF-unstable");
assert.equal(unstableAtMax.decisionReason, "max-attempts-one-semantic-success");

const invalidAtMax = classifyTaskEligibility([
  repeat("T-invalid", 1, false, "test-failure", "ok", "task-specific: mismatch"),
  repeat("T-invalid", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-invalid", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
  repeat("T-invalid", 4, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-invalid", 5, false, "test-failure", "ok", "hidden:execution:tsc failed"),
]);
assert.equal(invalidAtMax.capabilityClass, "invalid");
assert.equal(invalidAtMax.decisionReason, "max-attempts-insufficient-semantic-evidence");

const invariantEligible = classifyTaskEligibility([
  repeat("T-invariant-stress-x", 1, true, null, "ok", null, "valid", "invariant_stressing"),
  repeat("T-invariant-stress-x", 2, true, null, "ok", null, "valid", "invariant_stressing"),
  repeat("T-invariant-stress-x", 3, false, "test-failure", "ok", "task-specific: mismatch", "valid", "invariant_stressing"),
]);
assert.equal(invariantEligible.capabilityClass, "eligible");
assert.equal(invariantEligible.analysisRole, "diagnostic");
assert.equal(invariantEligible.classification, "T_diagnostic-eligible");

console.log("P6 failure-domain/capability classification verified, including response censoring, finite hold rule, role split, and 2026-09-20 pilot reclassification.");

function pick(x: ReturnType<typeof classifyTaskEligibility>) {
  return {
    semanticSuccesses: x.semanticSuccesses,
    semanticFailures: x.semanticFailures,
    protocolFailures: x.protocolFailures,
    protocolReliability: x.protocolReliability,
    capabilityClass: x.capabilityClass,
    analysisRole: x.analysisRole,
    classification: x.classification,
  };
}
'''
(ROOT / 'harness/verify-p6-failure-classification.ts').write_text(verify_failure, encoding='utf-8')

verify_bank = r'''import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  classifyTaskEligibility,
  type P61TaskClassification,
  type TaskRepeatLike,
} from "./src/p6/failure-classification";
import {
  buildCombinedEligibilityBank,
  missingRepeatPlan,
  nextEligibilityRepeatPlan,
  P6_1_EXPECTED_TASK_BANK_SIZE,
  P6_1_FROZEN_PILOT_PRIMARY,
  P6_1_FROZEN_PILOT_SEMANTIC_FLOOR,
  P6_1_INITIAL_REPEATS,
  P6_1_MAX_ATTEMPTS,
  P6_1_PILOT_TASK_IDS,
  plannedRepeats,
  selectRemainingEligibilityTasks,
} from "./src/p6/task-bank-eligibility";

const taskBankPath = path.resolve(__dirname, "../synthetic-world/heldout_tasks.json");
const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as Array<{ taskId: string; type?: string }>;

assert.strictEqual(tasks.length, P6_1_EXPECTED_TASK_BANK_SIZE);
assert.strictEqual(P6_1_INITIAL_REPEATS, 3);
assert.strictEqual(P6_1_MAX_ATTEMPTS, 5);
const remaining = selectRemainingEligibilityTasks(tasks);
assert.strictEqual(remaining.length, P6_1_EXPECTED_TASK_BANK_SIZE - P6_1_PILOT_TASK_IDS.length);
assert.strictEqual(remaining.length, 15);
assert.deepStrictEqual(
  remaining.filter((task) => P6_1_PILOT_TASK_IDS.includes(task.taskId as never)),
  []
);

const initialPlan = plannedRepeats(remaining);
assert.strictEqual(initialPlan.length, 15 * P6_1_INITIAL_REPEATS);
assert.strictEqual(initialPlan.length, 45);
assert.deepStrictEqual(initialPlan.slice(0, 3), [
  { taskId: remaining[0].taskId, repeat: 1 },
  { taskId: remaining[0].taskId, repeat: 2 },
  { taskId: remaining[0].taskId, repeat: 3 },
]);

const completed = [initialPlan[0], initialPlan[1], initialPlan[4]];
const missing = missingRepeatPlan(remaining, completed);
assert.strictEqual(missing.length, initialPlan.length - completed.length);
assert(!missing.some((item) => item.taskId === initialPlan[0].taskId && item.repeat === 1));
assert(missing.some((item) => item.taskId === initialPlan[0].taskId && item.repeat === 3));

const oneTask = [{ taskId: "T-extra", type: "local" }];
const threePending: TaskRepeatLike[] = [
  rr("T-extra", "local", 1, true),
  rr("T-extra", "local", 2, false, "output-parse", "output-parse-failure", "parse"),
  rr("T-extra", "local", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
];
assert.deepStrictEqual(nextEligibilityRepeatPlan(oneTask, threePending), [{ taskId: "T-extra", repeat: 4 }]);
const fourPending = [...threePending, rr("T-extra", "local", 4, false, "output-parse", "output-parse-failure", "parse")];
assert.deepStrictEqual(nextEligibilityRepeatPlan(oneTask, fourPending), [{ taskId: "T-extra", repeat: 5 }]);
const fiveTerminal = [...fourPending, rr("T-extra", "local", 5, false, "test-failure", "ok", "hidden:execution:tsc failed")];
assert.deepStrictEqual(nextEligibilityRepeatPlan(oneTask, fiveTerminal), []);
assert.equal(classifyTaskEligibility(fiveTerminal).capabilityClass, "AF-unstable");

const classifications: P61TaskClassification[] = [
  classification("T-synthetic-primary", "local", "eligible", "main"),
  classification("T-synthetic-diagnostic", "invariant_stressing", "eligible", "diagnostic"),
  classification("T-synthetic-floor", "cross_cutting", "semantic-floor", "main"),
  classification("T-synthetic-unstable", "local", "AF-unstable", "main"),
  classification("T-synthetic-pending", "local", "pending", "main"),
  classification("T-synthetic-invalid", "local", "invalid", "main"),
];
const bank = buildCombinedEligibilityBank(classifications);
assert.deepStrictEqual(bank.primary, [...P6_1_FROZEN_PILOT_PRIMARY, "T-synthetic-primary"]);
assert.deepStrictEqual(bank.eligibleDiagnostic, ["T-synthetic-diagnostic"]);
assert.deepStrictEqual(bank.diagnostic, ["T-synthetic-diagnostic"]);
assert.deepStrictEqual(bank.challengeSemanticFloor, [...P6_1_FROZEN_PILOT_SEMANTIC_FLOOR, "T-synthetic-floor"]);
assert.deepStrictEqual(bank.challengeAfUnstable, ["T-synthetic-unstable"]);
assert.deepStrictEqual(bank.pending, ["T-synthetic-pending"]);
assert.deepStrictEqual(bank.invalid, ["T-synthetic-invalid"]);
assert.strictEqual(bank.freezeReady, false);

const freezeReadyBank = buildCombinedEligibilityBank([
  classification("T-synthetic-primary", "local", "eligible", "main"),
  classification("T-synthetic-diagnostic", "invariant_stressing", "eligible", "diagnostic"),
  classification("T-synthetic-floor", "local", "semantic-floor", "main"),
  classification("T-synthetic-invalid", "local", "invalid", "main"),
]);
assert.strictEqual(freezeReadyBank.freezeReady, true);
assert(!freezeReadyBank.primary.includes("T-synthetic-diagnostic"));
assert(freezeReadyBank.diagnostic.includes("T-synthetic-diagnostic"));

assert.throws(
  () => selectRemainingEligibilityTasks([...tasks, tasks[0]]),
  /Duplicate taskId/
);
assert.throws(
  () => selectRemainingEligibilityTasks(tasks.filter((task) => task.taskId !== P6_1_PILOT_TASK_IDS[0])),
  /Frozen P6-1 pilot task\(s\) missing/
);

console.log("P6 full task-bank eligibility planning verified: 20 total, 5 frozen pilot, 15 remaining, 45 initial repeats, max 75 attempts, finite hold termination, role-separated banks.");

function rr(
  taskId: string,
  taskType: string,
  repeat: number,
  passed: boolean,
  failureCategory: string | null = null,
  executionStatus = "ok",
  failureReason: string | null = null
): TaskRepeatLike {
  return { taskId, taskType, repeat, passed, validity: "valid", failureCategory, executionStatus, failureReason };
}

function classification(
  taskId: string,
  taskType: string,
  capabilityClass: P61TaskClassification["capabilityClass"],
  analysisRole: P61TaskClassification["analysisRole"]
): P61TaskClassification {
  const classification = capabilityClass === "eligible"
    ? (analysisRole === "main" ? "T_primary-eligible" : "T_diagnostic-eligible")
    : capabilityClass === "semantic-floor"
      ? "T_challenge-semantic-floor"
      : capabilityClass === "AF-unstable"
        ? "T_challenge-AF-unstable"
        : capabilityClass === "invalid"
          ? "invalid-capability-classification"
          : "hold-more-semantic-repeats";
  return {
    taskId,
    taskType,
    attempts: 3,
    semanticSuccesses: capabilityClass === "eligible" ? 2 : 0,
    semanticFailures: capabilityClass === "semantic-floor" ? 2 : 0,
    semanticEvaluableRepeats: 2,
    protocolFailures: 0,
    systemFailures: 0,
    otherFailures: 0,
    infrastructureInvalidCount: capabilityClass === "invalid" ? 2 : 0,
    protocolReliabilitySuccesses: 3,
    protocolReliabilityTotal: 3,
    protocolReliability: 1,
    capabilityClass,
    analysisRole,
    needsAdditionalRepeat: capabilityClass === "pending",
    decisionReason: "test-fixture",
    classification,
  };
}
'''
(ROOT / 'harness/verify-p6-task-bank-eligibility.ts').write_text(verify_bank, encoding='utf-8')

runner = r'''import * as childProcess from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { OpenAIBackend } from "./src/agent-backend/openai";
import {
  OPENAI_MUTATION_SCHEMA_VERSION,
  OPENAI_PROMPT_HASH,
  OPENAI_PROMPT_VERSION,
  OPENAI_SCHEMA_HASH,
} from "./src/agent-backend/openai/shared";
import type { AgentResult } from "./src/agent-backend/types";
import { runScoring } from "./src/scoring";
import type { ModelProvenance, TestSuiteResult, TokenUsage } from "./src/types";
import { isCensoredAgentExecutionStatus } from "./src/run-validity";
import {
  classifyFailure,
  classifyTaskEligibility,
  DEFAULT_P6_1_ELIGIBILITY_RULE,
  P6_1_FAILURE_CLASSIFICATION_VERSION,
  type FailureClassification,
  type P61TaskClassification,
} from "./src/p6/failure-classification";
import {
  buildCombinedEligibilityBank,
  nextEligibilityRepeatPlan,
  P6_1_EXPECTED_TASK_BANK_SIZE,
  P6_1_INITIAL_REPEATS,
  P6_1_MAX_ATTEMPTS,
  P6_1_PILOT_TASK_IDS,
  P6_1_TASK_BANK_VERSION,
  selectRemainingEligibilityTasks,
  type EligibilityBankSets,
} from "./src/p6/task-bank-eligibility";

const MODEL = "gpt-5.6-luna";
const REASONING = "high" as const;
const RUN_SCHEMA_VERSION = "p6-1-task-bank-eligibility-result-v2";
const ARTIFACT_LAYOUT_VERSION = "p6-1-repeat-artifacts-v1";

const CRITICAL_SOURCE_FILES = [
  "harness/p6-task-bank-eligibility-live.ts",
  "harness/src/agent-backend/openai.ts",
  "harness/src/agent-backend/openai/shared.ts",
  "harness/src/p6/failure-classification.ts",
  "harness/src/p6/task-bank-eligibility.ts",
  "harness/src/run-validity.ts",
  "harness/src/scoring.ts",
] as const;

interface HeldOutTask {
  taskId: string;
  type?: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

interface P61RepeatResult {
  taskId: string;
  taskType: string | null;
  repeat: number;
  passed: boolean;
  validity: "valid" | "infrastructure-invalid";
  failureCategory: string | null;
  failureReason: string | null;
  executionStatus: string;
  visible: ReturnType<typeof suiteDigest> | null;
  hidden: ReturnType<typeof suiteDigest> | null;
  taskSpecific: ReturnType<typeof suiteDigest> | null;
  protocolContractViolated: boolean | null;
  modifiedPaths: string[];
  workingNote: string | null;
  actualModel: string | null;
  usage: TokenUsage | null;
  estimatedCostUsd: number | null;
}

interface P61ClassifiedRepeatResult extends P61RepeatResult, FailureClassification {}

interface RepeatArtifactBundle {
  rawResponse: string;
  modifiedFiles: Record<string, string>;
  modelProvenance: ModelProvenance | null;
  testResults: {
    visible: ReturnType<typeof suiteDigest> | null;
    hidden: ReturnType<typeof suiteDigest> | null;
    taskSpecific: ReturnType<typeof suiteDigest> | null;
    protocolContractViolated: boolean | null;
  };
  agentExecutionStatus: string;
  agentError: unknown;
  runnerError: string | null;
}

interface RepeatExecution {
  result: P61RepeatResult;
  artifacts: RepeatArtifactBundle;
}

interface ExecutionManifest {
  gitSha: string;
  promptVersion: string;
  promptHash: string;
  schemaVersion: string;
  schemaHash: string;
  runnerSha256: string;
  codeFingerprintSha256: string;
  criticalSourceFiles: string[];
}

interface EligibilityRunResult {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  artifactLayoutVersion: typeof ARTIFACT_LAYOUT_VERSION;
  taskBankVersion: typeof P6_1_TASK_BANK_VERSION;
  failureClassificationVersion: typeof P6_1_FAILURE_CLASSIFICATION_VERSION;
  status: "running" | "completed";
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  model: typeof MODEL;
  reasoningEffort: typeof REASONING;
  condition: "AF";
  initialRepeatsPerTask: number;
  maxAttemptsPerTask: number;
  executionManifest: ExecutionManifest;
  eligibilityRule: typeof DEFAULT_P6_1_ELIGIBILITY_RULE & {
    floorBasis: "semantic-failure-only";
    protocolFailureRole: "agent-output-reliability-diagnostic-only";
    analysisRoleRule: "invariant_stressing=>diagnostic;otherwise=>main";
  };
  taskBank: {
    path: string;
    sha256: string;
    totalTasks: number;
    frozenPilotTaskIds: string[];
    selectedRemainingTaskIds: string[];
  };
  baselineRepository: {
    path: string;
    sha256: string;
    fileCount: number;
  };
  repeatResults: P61ClassifiedRepeatResult[];
  classifications: P61TaskClassification[];
  pendingTaskIds: string[];
  nextPlannedRepeats: number;
  combinedBank: EligibilityBankSets;
  freezeReady: boolean;
  estimatedCostUsd: number;
}

function loadDirRecursive(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadDirRecursive(full, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).replace(/\\/g, "/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function hashRepository(files: Record<string, string>): string {
  const hash = crypto.createHash("sha256");
  for (const filePath of Object.keys(files).sort()) {
    hash.update(filePath);
    hash.update("\0");
    hash.update(files[filePath]);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashCriticalSources(repoRoot: string): string {
  const hash = crypto.createHash("sha256");
  for (const relativePath of CRITICAL_SOURCE_FILES) {
    const absolutePath = path.join(repoRoot, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function buildExecutionManifest(repoRoot: string): ExecutionManifest {
  const runnerPath = path.join(repoRoot, "harness/p6-task-bank-eligibility-live.ts");
  return {
    gitSha: childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    promptVersion: OPENAI_PROMPT_VERSION,
    promptHash: OPENAI_PROMPT_HASH,
    schemaVersion: OPENAI_MUTATION_SCHEMA_VERSION,
    schemaHash: OPENAI_SCHEMA_HASH,
    runnerSha256: hashText(fs.readFileSync(runnerPath, "utf8")),
    codeFingerprintSha256: hashCriticalSources(repoRoot),
    criticalSourceFiles: [...CRITICAL_SOURCE_FILES],
  };
}

function validateMutationPaths(files: Record<string, string>): string | null {
  for (const raw of Object.keys(files)) {
    const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
      return `write-escape:${raw}`;
    }
    if (!(normalized.startsWith("src/") || normalized.startsWith("tests/"))) {
      return `write-outside-repository-contract:${raw}`;
    }
  }
  return null;
}

function suiteDigest(s: TestSuiteResult) {
  return {
    passed: s.passed,
    numPassed: s.numPassed,
    numFailed: s.numFailed,
    executionError: s.executionError ?? null,
    failedCases: s.testCases
      .filter((t) => !t.passed)
      .map((t) => ({ testName: t.testName, error: t.error ?? null })),
  };
}

function failureReasonFromSuites(
  visible: TestSuiteResult,
  hidden: TestSuiteResult,
  taskSpecific: TestSuiteResult | null
): string | null {
  const parts: string[] = [];
  for (const [name, suite] of [["visible", visible], ["hidden", hidden], ["task-specific", taskSpecific]] as const) {
    if (!suite) continue;
    if (suite.executionError) parts.push(`${name}:execution:${suite.executionError}`);
    for (const test of suite.testCases.filter((item) => !item.passed)) {
      parts.push(`${name}:${test.testName}${test.error ? `:${test.error}` : ""}`);
    }
  }
  return parts.length ? parts.join(" | ") : null;
}

function artifactBundleFromAgent(
  agent: AgentResult,
  testResults: RepeatArtifactBundle["testResults"],
  runnerError: string | null = null
): RepeatArtifactBundle {
  return {
    rawResponse: agent.rawResponse,
    modifiedFiles: { ...(agent.modifiedFiles ?? {}) },
    modelProvenance: agent.modelProvenance,
    testResults,
    agentExecutionStatus: agent.executionStatus,
    agentError: agent.error,
    runnerError,
  };
}

async function runTaskRepeat(
  repository: Record<string, string>,
  syntheticWorldDir: string,
  task: HeldOutTask,
  repeat: number
): Promise<RepeatExecution> {
  const backend = new OpenAIBackend({
    model: MODEL,
    reasoningEffort: REASONING,
    maxOutputTokens: 7000,
    requestTimeoutMs: 180000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 0,
    serviceTier: "default",
    promptCacheMode: "implicit",
  });

  const agent = await backend.run({
    contextFiles: repository,
    visibleInstruction: task.visibleInstruction,
    contextBudget: "full",
  });

  const modifiedPaths = Object.keys(agent.modifiedFiles ?? {}).sort();
  const emptyTests: RepeatArtifactBundle["testResults"] = {
    visible: null,
    hidden: null,
    taskSpecific: null,
    protocolContractViolated: null,
  };

  if (agent.executionStatus !== "ok") {
    const invalid = isCensoredAgentExecutionStatus(agent.executionStatus) || agent.error?.category === "provider";
    const result: P61RepeatResult = {
      taskId: task.taskId,
      taskType: task.type ?? null,
      repeat,
      passed: false,
      validity: invalid ? "infrastructure-invalid" : "valid",
      failureCategory: agent.error?.category ?? agent.executionStatus,
      failureReason: agent.error?.message ?? agent.executionStatus,
      executionStatus: agent.executionStatus,
      visible: null,
      hidden: null,
      taskSpecific: null,
      protocolContractViolated: null,
      modifiedPaths,
      workingNote: agent.explicitWorkingNote,
      actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null,
      estimatedCostUsd: agent.estimatedCostUsd ?? null,
    };
    return { result, artifacts: artifactBundleFromAgent(agent, emptyTests) };
  }

  const pathError = validateMutationPaths(agent.modifiedFiles);
  if (pathError) {
    const result: P61RepeatResult = {
      taskId: task.taskId,
      taskType: task.type ?? null,
      repeat,
      passed: false,
      validity: "valid",
      failureCategory: "mutation-validation",
      failureReason: pathError,
      executionStatus: "mutation-validation-failure",
      visible: null,
      hidden: null,
      taskSpecific: null,
      protocolContractViolated: null,
      modifiedPaths,
      workingNote: agent.explicitWorkingNote,
      actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null,
      estimatedCostUsd: agent.estimatedCostUsd ?? null,
    };
    return { result, artifacts: artifactBundleFromAgent(agent, emptyTests) };
  }

  const merged = { ...repository, ...agent.modifiedFiles };
  try {
    const scoring = await runScoring(merged, syntheticWorldDir, task.taskSpecificTestCode);
    const visible = suiteDigest(scoring.visibleTests);
    const hidden = suiteDigest(scoring.hiddenTests);
    const taskSpecific = scoring.taskSpecificTests ? suiteDigest(scoring.taskSpecificTests) : null;
    const passed =
      scoring.visibleTests.passed &&
      scoring.hiddenTests.passed &&
      (scoring.taskSpecificTests?.passed ?? true) &&
      !scoring.protocolContractViolated;

    const result: P61RepeatResult = {
      taskId: task.taskId,
      taskType: task.type ?? null,
      repeat,
      passed,
      validity: "valid",
      failureCategory: passed
        ? null
        : scoring.protocolContractViolated
          ? "protocol-contract"
          : "test-failure",
      failureReason: passed
        ? null
        : failureReasonFromSuites(scoring.visibleTests, scoring.hiddenTests, scoring.taskSpecificTests),
      executionStatus: agent.executionStatus,
      visible,
      hidden,
      taskSpecific,
      protocolContractViolated: scoring.protocolContractViolated,
      modifiedPaths,
      workingNote: agent.explicitWorkingNote,
      actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null,
      estimatedCostUsd: agent.estimatedCostUsd ?? null,
    };
    return {
      result,
      artifacts: artifactBundleFromAgent(agent, {
        visible,
        hidden,
        taskSpecific,
        protocolContractViolated: scoring.protocolContractViolated,
      }),
    };
  } catch (error) {
    const runnerError = error instanceof Error ? error.stack ?? error.message : String(error);
    const result: P61RepeatResult = {
      taskId: task.taskId,
      taskType: task.type ?? null,
      repeat,
      passed: false,
      validity: "infrastructure-invalid",
      failureCategory: "harness",
      failureReason: runnerError,
      executionStatus: agent.executionStatus,
      visible: null,
      hidden: null,
      taskSpecific: null,
      protocolContractViolated: null,
      modifiedPaths,
      workingNote: agent.explicitWorkingNote,
      actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null,
      estimatedCostUsd: agent.estimatedCostUsd ?? null,
    };
    return { result, artifacts: artifactBundleFromAgent(agent, emptyTests, runnerError) };
  }
}

function classifyRepeat(result: P61RepeatResult): P61ClassifiedRepeatResult {
  return { ...result, ...classifyFailure(result) };
}

function recompute(result: EligibilityRunResult, selectedTasks: HeldOutTask[]): void {
  const classifications: P61TaskClassification[] = [];
  const pendingTaskIds: string[] = [];

  for (const task of selectedTasks) {
    const repeats = result.repeatResults
      .filter((item) => item.taskId === task.taskId)
      .sort((a, b) => a.repeat - b.repeat);
    if (!repeats.length) {
      pendingTaskIds.push(task.taskId);
      continue;
    }
    const classification = classifyTaskEligibility(repeats, DEFAULT_P6_1_ELIGIBILITY_RULE);
    classifications.push(classification);
    if (classification.capabilityClass === "pending") pendingTaskIds.push(task.taskId);
  }

  const nextPlan = nextEligibilityRepeatPlan(selectedTasks, result.repeatResults);
  const combinedBank = buildCombinedEligibilityBank(classifications);
  const allTasksClassified = classifications.length === selectedTasks.length;

  result.classifications = classifications;
  result.pendingTaskIds = pendingTaskIds;
  result.nextPlannedRepeats = nextPlan.length;
  result.combinedBank = {
    ...combinedBank,
    freezeReady: combinedBank.freezeReady && allTasksClassified && nextPlan.length === 0,
  };
  result.freezeReady = result.combinedBank.freezeReady;
  result.estimatedCostUsd = result.repeatResults.reduce(
    (sum, item) => sum + (item.estimatedCostUsd ?? 0),
    0
  );
  result.updatedAt = new Date().toISOString();
}

function writeResult(resultPath: string, result: EligibilityRunResult): void {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  const tmp = `${resultPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, resultPath);
}

function writeRepeatArtifacts(runDir: string, result: P61RepeatResult, artifacts: RepeatArtifactBundle): void {
  const safeTaskId = result.taskId.replace(/[^A-Za-z0-9._-]/g, "_");
  const dir = path.join(runDir, safeTaskId, `repeat-${result.repeat}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "agent_response.txt"), artifacts.rawResponse, "utf8");
  fs.writeFileSync(path.join(dir, "modified_files.json"), JSON.stringify(artifacts.modifiedFiles, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(dir, "model_provenance.json"), JSON.stringify(artifacts.modelProvenance, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(dir, "test_results.json"), JSON.stringify(artifacts.testResults, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(dir, "repeat_meta.json"), JSON.stringify({
    taskId: result.taskId,
    repeat: result.repeat,
    executionStatus: artifacts.agentExecutionStatus,
    agentError: artifacts.agentError,
    runnerError: artifacts.runnerError,
  }, null, 2) + "\n", "utf8");
}

function parseResumePath(argv: string[]): string | null {
  const index = argv.indexOf("--resume");
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value) throw new Error("--resume requires a result.json path");
  return path.resolve(process.cwd(), value);
}

function createResultPath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    repoRoot,
    "runs",
    "_calibration",
    `p6-1-task-bank-eligibility-luna__${stamp}`,
    "result.json"
  );
}

function newResult(
  taskBankPath: string,
  taskBankRaw: string,
  allTasks: HeldOutTask[],
  selectedTasks: HeldOutTask[],
  repositoryPath: string,
  repository: Record<string, string>,
  executionManifest: ExecutionManifest
): EligibilityRunResult {
  const now = new Date().toISOString();
  const combinedBank = buildCombinedEligibilityBank([]);
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    artifactLayoutVersion: ARTIFACT_LAYOUT_VERSION,
    taskBankVersion: P6_1_TASK_BANK_VERSION,
    failureClassificationVersion: P6_1_FAILURE_CLASSIFICATION_VERSION,
    status: "running",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    model: MODEL,
    reasoningEffort: REASONING,
    condition: "AF",
    initialRepeatsPerTask: P6_1_INITIAL_REPEATS,
    maxAttemptsPerTask: P6_1_MAX_ATTEMPTS,
    executionManifest,
    eligibilityRule: {
      ...DEFAULT_P6_1_ELIGIBILITY_RULE,
      floorBasis: "semantic-failure-only",
      protocolFailureRole: "agent-output-reliability-diagnostic-only",
      analysisRoleRule: "invariant_stressing=>diagnostic;otherwise=>main",
    },
    taskBank: {
      path: taskBankPath,
      sha256: hashText(taskBankRaw),
      totalTasks: allTasks.length,
      frozenPilotTaskIds: [...P6_1_PILOT_TASK_IDS],
      selectedRemainingTaskIds: selectedTasks.map((task) => task.taskId),
    },
    baselineRepository: {
      path: repositoryPath,
      sha256: hashRepository(repository),
      fileCount: Object.keys(repository).length,
    },
    repeatResults: [],
    classifications: [],
    pendingTaskIds: selectedTasks.map((task) => task.taskId),
    nextPlannedRepeats: selectedTasks.length,
    combinedBank: { ...combinedBank, freezeReady: false },
    freezeReady: false,
    estimatedCostUsd: 0,
  };
}

function validateResume(
  result: EligibilityRunResult,
  taskBankRaw: string,
  allTasks: HeldOutTask[],
  selectedTasks: HeldOutTask[],
  repository: Record<string, string>,
  currentManifest: ExecutionManifest
): void {
  if (result.schemaVersion !== RUN_SCHEMA_VERSION) {
    throw new Error(`Resume schema mismatch: ${result.schemaVersion}`);
  }
  if (result.model !== MODEL || result.reasoningEffort !== REASONING || result.condition !== "AF") {
    throw new Error("Resume model/reasoning/condition mismatch");
  }
  if (JSON.stringify(result.executionManifest) !== JSON.stringify(currentManifest)) {
    throw new Error("Resume refused: execution manifest changed (git/prompt/schema/runner fingerprint mismatch)");
  }
  if (result.taskBank.sha256 !== hashText(taskBankRaw)) {
    throw new Error("Resume refused: heldout_tasks.json changed since the run started");
  }
  if (result.baselineRepository.sha256 !== hashRepository(repository)) {
    throw new Error("Resume refused: baseline repository changed since the run started");
  }
  if (result.taskBank.totalTasks !== allTasks.length) {
    throw new Error("Resume refused: task-bank size changed");
  }
  const selected = selectedTasks.map((task) => task.taskId);
  if (JSON.stringify(result.taskBank.selectedRemainingTaskIds) !== JSON.stringify(selected)) {
    throw new Error("Resume refused: selected remaining task IDs changed");
  }

  const keys = new Set<string>();
  for (const item of result.repeatResults) {
    const key = `${item.taskId}#${item.repeat}`;
    if (keys.has(key)) throw new Error(`Resume result contains duplicate repeat: ${key}`);
    keys.add(key);
  }
}

function emptyHarnessArtifacts(error: unknown): RepeatArtifactBundle {
  return {
    rawResponse: "",
    modifiedFiles: {},
    modelProvenance: null,
    testResults: { visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null },
    agentExecutionStatus: "harness-error",
    agentError: null,
    runnerError: error instanceof Error ? error.stack ?? error.message : String(error),
  };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");
  const taskBankPath = path.join(syntheticWorldDir, "heldout_tasks.json");

  const taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const allTasks = JSON.parse(taskBankRaw) as HeldOutTask[];
  if (allTasks.length !== P6_1_EXPECTED_TASK_BANK_SIZE) {
    throw new Error(
      `Frozen P6-1 task-bank size mismatch: expected ${P6_1_EXPECTED_TASK_BANK_SIZE}, got ${allTasks.length}`
    );
  }
  const selectedTasks = selectRemainingEligibilityTasks(allTasks);
  const expectedRemaining = P6_1_EXPECTED_TASK_BANK_SIZE - P6_1_PILOT_TASK_IDS.length;
  if (selectedTasks.length !== expectedRemaining) {
    throw new Error(`Expected ${expectedRemaining} remaining tasks, got ${selectedTasks.length}`);
  }

  const repository: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repository);
  const executionManifest = buildExecutionManifest(repoRoot);

  console.log("P6-1 FULL TASK-BANK PREDECLARED RULE", JSON.stringify({
    initialAttempts: P6_1_INITIAL_REPEATS,
    maxAttempts: P6_1_MAX_ATTEMPTS,
    maxTotalAttempts: selectedTasks.length * P6_1_MAX_ATTEMPTS,
    ...DEFAULT_P6_1_ELIGIBILITY_RULE,
    floorBasis: "semantic-failure-only",
    protocolFailureRole: "agent-output-reliability-diagnostic-only",
    analysisRoleRule: "invariant_stressing=>diagnostic;otherwise=>main",
    classificationVersion: P6_1_FAILURE_CLASSIFICATION_VERSION,
  }));
  console.log("P6-1 EXECUTION MANIFEST", JSON.stringify(executionManifest));
  console.log("P6-1 FROZEN PILOT EXCLUDED", P6_1_PILOT_TASK_IDS.join(","));
  console.log("P6-1 REMAINING TASKS", selectedTasks.map((task) => task.taskId).join(","));
  console.log("P6-1 INITIAL LIVE REPEATS", selectedTasks.length * P6_1_INITIAL_REPEATS);
  console.log("P6-1 MAX LIVE ATTEMPTS", selectedTasks.length * P6_1_MAX_ATTEMPTS);

  if (process.argv.includes("--dry-run")) {
    console.log("DRY RUN: no API calls made.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for live eligibility expansion");

  const resumePath = parseResumePath(process.argv.slice(2));
  const resultPath = resumePath ?? createResultPath(repoRoot);
  const runDir = path.dirname(resultPath);
  let result: EligibilityRunResult;

  if (resumePath) {
    result = JSON.parse(fs.readFileSync(resumePath, "utf8")) as EligibilityRunResult;
    validateResume(result, taskBankRaw, allTasks, selectedTasks, repository, executionManifest);
    result.status = "running";
    result.completedAt = null;
    recompute(result, selectedTasks);
    console.log("RESUME", resultPath, `completed=${result.repeatResults.length}`);
  } else {
    result = newResult(taskBankPath, taskBankRaw, allTasks, selectedTasks, repositoryDir, repository, executionManifest);
    writeResult(resultPath, result);
    console.log("RESULT", resultPath);
  }

  const taskById = new Map(selectedTasks.map((task) => [task.taskId, task]));

  while (true) {
    const nextPlan = nextEligibilityRepeatPlan(selectedTasks, result.repeatResults);
    if (!nextPlan.length) break;

    for (const planned of nextPlan) {
      const task = taskById.get(planned.taskId);
      if (!task) throw new Error(`Planned task missing: ${planned.taskId}`);

      let execution: RepeatExecution;
      try {
        execution = await runTaskRepeat(repository, syntheticWorldDir, task, planned.repeat);
      } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        execution = {
          result: {
            taskId: task.taskId,
            taskType: task.type ?? null,
            repeat: planned.repeat,
            passed: false,
            validity: "infrastructure-invalid",
            failureCategory: "harness",
            failureReason: message,
            executionStatus: "harness-error",
            visible: null,
            hidden: null,
            taskSpecific: null,
            protocolContractViolated: null,
            modifiedPaths: [],
            workingNote: null,
            actualModel: null,
            usage: null,
            estimatedCostUsd: null,
          },
          artifacts: emptyHarnessArtifacts(error),
        };
      }

      writeRepeatArtifacts(runDir, execution.result, execution.artifacts);
      const classified = classifyRepeat(execution.result);
      result.repeatResults.push(classified);
      recompute(result, selectedTasks);
      writeResult(resultPath, result);

      console.log(
        `P6-1 ${classified.taskId} repeat=${classified.repeat} ` +
        `passed=${classified.passed} domain=${classified.failureDomain} ` +
        `validity=${classified.validity} category=${classified.failureCategory ?? "none"} ` +
        `cost=$${(classified.estimatedCostUsd ?? 0).toFixed(6)}`
      );
    }
  }

  recompute(result, selectedTasks);
  result.status = "completed";
  result.completedAt = new Date().toISOString();
  result.updatedAt = result.completedAt;
  writeResult(resultPath, result);

  console.log("P6-1 FULL TASK-BANK CLASSIFICATIONS");
  for (const classification of result.classifications) {
    console.log(JSON.stringify(classification));
  }
  console.log("P6-1 COMBINED BANK", JSON.stringify(result.combinedBank));
  console.log(`P6-1 TOTAL COST $${result.estimatedCostUsd.toFixed(6)}`);
  console.log("RESULT", resultPath);
  console.log("STOP: P6-2 was not executed.");
}

main().catch((error) => {
  console.error("p6-task-bank-eligibility-live failed:", error);
  process.exit(1);
});
'''
(ROOT / 'harness/p6-task-bank-eligibility-live.ts').write_text(runner, encoding='utf-8')

plan_path = ROOT / 'docs/stage1_plan.md'
plan = plan_path.read_text(encoding='utf-8')
if '### 10.1.4 P6-1b full task-bank eligibility predeclaration' not in plan:
    insertion = r'''
### 10.1.4 P6-1b full task-bank eligibility predeclaration（live前freeze）

P6-1bは、20 task bankのうち既にP6-1 pilotでfreeze済みの5 taskを再実行せず、残り15 taskをGPT-5.6 Luna / reasoning=`high` / Artifact-Fullで評価する。**本節の規則はlive resultを見る前にfreezeする。**

#### attempt / hold終了規則

各taskは初期3 attemptを必ず実行する。protocol/system/other failureによりsemantic-evaluable evidenceが不足し、3 attempt後もterminal classificationに到達しない場合のみ追加attemptを許可する。追加は最大2回、したがって**1 taskあたり最大5 attempt**、15 task全体では初期45 attempt・最大75 attemptを上限とする。

3 attempt以降のcapability判定は次で固定する。

- `semanticSuccesses >= 2` → `eligible`
- `semanticSuccesses = 0` かつ `semanticFailures >= 2` → `semantic-floor`
- `semanticSuccesses = 1` かつ `semanticFailures >= 2` → `AF-unstable`
- 上記に達せずattempt < 5 → `pending`として追加attempt
- attempt = 5で`semanticSuccesses = 1`のまま → `AF-unstable`
- attempt = 5でも上記terminal条件を満たさずsemantic evidence不足 → `invalid`
- infrastructure-invalidが3 attempt以降で2回以上 → `invalid`

したがって`hold`は無期限に残らない。`semantic-floor`と`AF-unstable`は別categoryで保存し、後者をfloorと混同しない。

#### capabilityClassとanalysisRoleを分離

各taskについて、能力上の判定と研究上の役割を別軸で保存する。

- `capabilityClass ∈ {eligible, semantic-floor, AF-unstable, invalid, pending}`
- `analysisRole ∈ {main, diagnostic}`
- `taskType = invariant_stressing` → `analysisRole = diagnostic`
- その他のtask type → `analysisRole = main`

main primary bankは

\[
\mathcal T_{primary}=\{t\mid capabilityClass(t)=eligible\ \land\ analysisRole(t)=main\}
\]

とする。`eligible ∩ diagnostic`は解けるtaskであってもprimary outcomeへ混ぜず、diagnosticとして別集計する。`semantic-floor` / `AF-unstable`はchallenge categoryとして別々に保持する。

#### provider/response failure semantics

`provider-error` / `response-failed` / `response-incomplete` / `response-not-completed` / `response-refusal`は、orchestratorのrun-validityとP6 eligibilityで同じ共有集合を用い、すべて`infrastructure`として扱う。semantic failure票へ加えない。

#### resume freeze / provenance

run開始時にtask bank SHA、baseline repository SHAに加えて、以下をmanifestへ固定する。

- git SHA
- OpenAI `promptVersion` / `promptHash`
- OpenAI `schemaVersion` / `schemaHash`
- eligibility runner SHA256
- runner / OpenAI backend / prompt-schema / classification / scoring等のcritical source fingerprint

resume時にいずれかが不一致なら同一runへの追記を拒否する。

#### repeat artifact保存

各repeatについて`result.json`とは別に、run directory配下の`<taskId>/repeat-N/`へ少なくとも以下を保存する。

- `agent_response.txt`：raw response
- `modified_files.json`：生成された変更内容
- `model_provenance.json`：model / prompt / schema / SDK等のprovenance
- `test_results.json`：visible / hidden / task-specific / protocol判定
- `repeat_meta.json`：execution status / normalized error / runner error

これにより、後からsemantic failureの具体的原因を再監査できるようにする。

**P6-1b live実行は、本実装・unit test・既存回帰・CIがgreenであることを確認した後にのみ開始する。P6-2はまだ実行しない。**

'''
    marker = '\n### 10.2 P6-2：AF baseline\n'
    if marker not in plan:
        raise SystemExit('stage1 plan P6-2 marker not found')
    plan = plan.replace(marker, '\n' + insertion + marker, 1)

old_check = '40. **P6-1b** task bank全体eligibility拡張（同一failure-domain ruleでprimary/challenge最終freeze） ← 次'
new_check = '40. **P6-1b** task bank全体eligibility拡張（finite hold / capability-role分離 / provenance freeze実装済み、live未実行） ← 次'
if old_check in plan:
    plan = plan.replace(old_check, new_check)
plan_path.write_text(plan, encoding='utf-8')
