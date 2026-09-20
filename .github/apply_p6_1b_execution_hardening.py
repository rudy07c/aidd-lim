from pathlib import Path
import json

ROOT = Path('.')

runtime = r'''import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { TaskRepeatLike } from "./failure-classification";
import {
  missingRepeatPlan,
  nextEligibilityRepeatPlan,
  P6_1_INITIAL_REPEATS,
  type RepeatIdentity,
  type TaskIdentity,
} from "./task-bank-eligibility";

export type EligibilityExecutionPhase = "initial" | "hold-continuation";

export const REPEAT_ARTIFACT_FILES = [
  "agent_response.txt",
  "modified_files.json",
  "model_provenance.json",
  "test_results.json",
  "repeat_meta.json",
] as const;

export interface RepeatArtifactBundle {
  rawResponse: string;
  modifiedFiles: Record<string, string>;
  modelProvenance: unknown;
  testResults: unknown;
  agentExecutionStatus: string;
  agentError: unknown;
  runnerError: string | null;
}

export interface ArtifactReconciliation<T extends TaskRepeatLike> {
  repeatResults: T[];
  missingArtifactKeys: string[];
  recoveredArtifactKeys: string[];
}

export function assertTrackedWorktreeClean(repoRoot: string): void {
  const status = childProcess.execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim();
  if (status) {
    throw new Error(
      `Scientific live run requires a clean tracked worktree. Commit/stash tracked changes first:\n${status}`
    );
  }
}

export function planEligibilityPhase<T extends TaskIdentity>(
  tasks: T[],
  completed: TaskRepeatLike[],
  phase: EligibilityExecutionPhase
): RepeatIdentity[] {
  if (phase === "initial") {
    return missingRepeatPlan(tasks, completed, P6_1_INITIAL_REPEATS);
  }
  assertInitialPhaseComplete(tasks, completed);
  return nextEligibilityRepeatPlan(tasks, completed)
    .filter((item) => item.repeat > P6_1_INITIAL_REPEATS);
}

export function assertInitialPhaseComplete<T extends TaskIdentity>(
  tasks: T[],
  completed: TaskRepeatLike[]
): void {
  const keys = new Set(completed.map((item) => repeatKey(item.taskId, item.repeat)));
  const missing: string[] = [];
  for (const task of tasks) {
    for (let repeat = 1; repeat <= P6_1_INITIAL_REPEATS; repeat++) {
      const key = repeatKey(task.taskId, repeat);
      if (!keys.has(key)) missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `hold-continuation requires a complete initial phase; missing ${missing.length} initial repeat(s): ${missing.slice(0, 10).join(",")}`
    );
  }
}

export function assertResumeManifestEqual(actual: unknown, expected: unknown): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error("Resume refused: frozen execution manifest changed");
  }
}

export function repeatArtifactDirectory(runDir: string, taskId: string, repeat: number): string {
  const safeTaskId = taskId.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(runDir, safeTaskId, `repeat-${repeat}`);
}

export function repeatArtifactBundleComplete(runDir: string, taskId: string, repeat: number): boolean {
  const dir = repeatArtifactDirectory(runDir, taskId, repeat);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return REPEAT_ARTIFACT_FILES.every((fileName) => fs.existsSync(path.join(dir, fileName)));
}

export function commitRepeatArtifactsAtomic<T extends TaskRepeatLike>(
  runDir: string,
  repeatResult: T,
  artifacts: RepeatArtifactBundle
): void {
  const target = repeatArtifactDirectory(runDir, repeatResult.taskId, repeatResult.repeat);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmp, "agent_response.txt"), artifacts.rawResponse, "utf8");
    fs.writeFileSync(
      path.join(tmp, "modified_files.json"),
      JSON.stringify(artifacts.modifiedFiles, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "model_provenance.json"),
      JSON.stringify(artifacts.modelProvenance, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "test_results.json"),
      JSON.stringify(artifacts.testResults, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "repeat_meta.json"),
      JSON.stringify({
        repeatResult,
        agentExecutionStatus: artifacts.agentExecutionStatus,
        agentError: artifacts.agentError,
        runnerError: artifacts.runnerError,
      }, null, 2) + "\n",
      "utf8"
    );

    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

export function reconcileRepeatJournal<T extends TaskRepeatLike>(
  runDir: string,
  recorded: T[]
): ArtifactReconciliation<T> {
  const kept: T[] = [];
  const missingArtifactKeys: string[] = [];
  const recoveredArtifactKeys: string[] = [];
  const seen = new Set<string>();

  for (const item of recorded) {
    const key = repeatKey(item.taskId, item.repeat);
    if (seen.has(key)) throw new Error(`Duplicate repeat in result.json: ${key}`);
    if (repeatArtifactBundleComplete(runDir, item.taskId, item.repeat)) {
      kept.push(item);
      seen.add(key);
    } else {
      missingArtifactKeys.push(key);
      fs.rmSync(repeatArtifactDirectory(runDir, item.taskId, item.repeat), { recursive: true, force: true });
    }
  }

  if (fs.existsSync(runDir)) {
    for (const taskEntry of fs.readdirSync(runDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory()) continue;
      const taskDir = path.join(runDir, taskEntry.name);
      for (const repeatEntry of fs.readdirSync(taskDir, { withFileTypes: true })) {
        if (!repeatEntry.isDirectory()) continue;
        const match = /^repeat-(\d+)$/.exec(repeatEntry.name);
        if (!match) continue;
        const repeatDir = path.join(taskDir, repeatEntry.name);
        const metaPath = path.join(repeatDir, "repeat_meta.json");
        if (!REPEAT_ARTIFACT_FILES.every((name) => fs.existsSync(path.join(repeatDir, name)))) {
          fs.rmSync(repeatDir, { recursive: true, force: true });
          continue;
        }
        let recovered: T;
        try {
          const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          recovered = parsed.repeatResult as T;
        } catch {
          fs.rmSync(repeatDir, { recursive: true, force: true });
          continue;
        }
        if (!recovered || typeof recovered.taskId !== "string" || !Number.isInteger(recovered.repeat)) {
          fs.rmSync(repeatDir, { recursive: true, force: true });
          continue;
        }
        const key = repeatKey(recovered.taskId, recovered.repeat);
        if (!seen.has(key)) {
          kept.push(recovered);
          seen.add(key);
          recoveredArtifactKeys.push(key);
        }
      }
    }
  }

  kept.sort((a, b) => a.taskId.localeCompare(b.taskId) || a.repeat - b.repeat);
  return { repeatResults: kept, missingArtifactKeys, recoveredArtifactKeys };
}

function repeatKey(taskId: string, repeat: number): string {
  return `${taskId}#${repeat}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
'''

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
  getPackageVersion,
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
  P6_1_EXPECTED_TASK_BANK_SIZE,
  P6_1_INITIAL_REPEATS,
  P6_1_MAX_ATTEMPTS,
  P6_1_PILOT_TASK_IDS,
  P6_1_TASK_BANK_VERSION,
  selectRemainingEligibilityTasks,
  type EligibilityBankSets,
} from "./src/p6/task-bank-eligibility";
import {
  assertInitialPhaseComplete,
  assertResumeManifestEqual,
  assertTrackedWorktreeClean,
  commitRepeatArtifactsAtomic,
  planEligibilityPhase,
  reconcileRepeatJournal,
  repeatArtifactBundleComplete,
  type EligibilityExecutionPhase,
  type RepeatArtifactBundle,
} from "./src/p6/task-bank-live-runtime";

const MODEL = "gpt-5.6-luna";
const REASONING = "high" as const;
const MAX_OUTPUT_TOKENS = 7000;
const REQUEST_TIMEOUT_MS = 180000;
const MAX_RETRIES = 2;
const SERVICE_TIER = "default" as const;
const PROMPT_CACHE_MODE = "implicit" as const;
const RUN_SCHEMA_VERSION = "p6-1-task-bank-eligibility-result-v3";
const ARTIFACT_LAYOUT_VERSION = "p6-1-repeat-artifacts-v2";

const FROZEN_ELIGIBILITY_RULE = {
  ...DEFAULT_P6_1_ELIGIBILITY_RULE,
  floorBasis: "semantic-failure-only",
  protocolFailureRole: "agent-output-reliability-diagnostic-only",
  analysisRoleRule: "invariant_stressing=>diagnostic;otherwise=>main",
} as const;

const CRITICAL_SOURCE_FILES = [
  "harness/p6-task-bank-eligibility-live.ts",
  "harness/src/p6/task-bank-live-runtime.ts",
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

interface RepeatExecution {
  result: P61RepeatResult;
  artifacts: RepeatArtifactBundle;
}

interface ExecutionManifest {
  gitSha: string;
  taskBankVersion: typeof P6_1_TASK_BANK_VERSION;
  failureClassificationVersion: typeof P6_1_FAILURE_CLASSIFICATION_VERSION;
  artifactLayoutVersion: typeof ARTIFACT_LAYOUT_VERSION;
  eligibilityRule: typeof FROZEN_ELIGIBILITY_RULE;
  initialRepeatsPerTask: number;
  maxAttemptsPerTask: number;
  model: typeof MODEL;
  reasoningEffort: typeof REASONING;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  serviceTier: typeof SERVICE_TIER;
  promptCacheMode: typeof PROMPT_CACHE_MODE;
  promptVersion: string;
  promptHash: string;
  schemaVersion: string;
  schemaHash: string;
  openAiSdkVersion: string | null;
  nodeVersion: string;
  runnerSha256: string;
  codeFingerprintSha256: string;
  criticalSourceFiles: string[];
}

type RunStatus = "initial-running" | "initial-completed" | "hold-running" | "completed";

interface EligibilityRunResult {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  artifactLayoutVersion: typeof ARTIFACT_LAYOUT_VERSION;
  taskBankVersion: typeof P6_1_TASK_BANK_VERSION;
  failureClassificationVersion: typeof P6_1_FAILURE_CLASSIFICATION_VERSION;
  status: RunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  model: typeof MODEL;
  reasoningEffort: typeof REASONING;
  condition: "AF";
  initialRepeatsPerTask: number;
  maxAttemptsPerTask: number;
  executionManifest: ExecutionManifest;
  eligibilityRule: typeof FROZEN_ELIGIBILITY_RULE;
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
    taskBankVersion: P6_1_TASK_BANK_VERSION,
    failureClassificationVersion: P6_1_FAILURE_CLASSIFICATION_VERSION,
    artifactLayoutVersion: ARTIFACT_LAYOUT_VERSION,
    eligibilityRule: FROZEN_ELIGIBILITY_RULE,
    initialRepeatsPerTask: P6_1_INITIAL_REPEATS,
    maxAttemptsPerTask: P6_1_MAX_ATTEMPTS,
    model: MODEL,
    reasoningEffort: REASONING,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    serviceTier: SERVICE_TIER,
    promptCacheMode: PROMPT_CACHE_MODE,
    promptVersion: OPENAI_PROMPT_VERSION,
    promptHash: OPENAI_PROMPT_HASH,
    schemaVersion: OPENAI_MUTATION_SCHEMA_VERSION,
    schemaHash: OPENAI_SCHEMA_HASH,
    openAiSdkVersion: getPackageVersion("openai"),
    nodeVersion: process.version,
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
  testResults: unknown,
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
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    storeResponses: false,
    maxToolRounds: 0,
    serviceTier: SERVICE_TIER,
    promptCacheMode: PROMPT_CACHE_MODE,
  });

  const agent = await backend.run({
    contextFiles: repository,
    visibleInstruction: task.visibleInstruction,
    contextBudget: "full",
  });

  const modifiedPaths = Object.keys(agent.modifiedFiles ?? {}).sort();
  const emptyTests = { visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null };

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
    const passed = scoring.visibleTests.passed && scoring.hiddenTests.passed &&
      (scoring.taskSpecificTests?.passed ?? true) && !scoring.protocolContractViolated;
    const result: P61RepeatResult = {
      taskId: task.taskId,
      taskType: task.type ?? null,
      repeat,
      passed,
      validity: "valid",
      failureCategory: passed ? null : scoring.protocolContractViolated ? "protocol-contract" : "test-failure",
      failureReason: passed ? null : failureReasonFromSuites(scoring.visibleTests, scoring.hiddenTests, scoring.taskSpecificTests),
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
      artifacts: artifactBundleFromAgent(agent, { visible, hidden, taskSpecific, protocolContractViolated: scoring.protocolContractViolated }),
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
    const repeats = result.repeatResults.filter((item) => item.taskId === task.taskId).sort((a, b) => a.repeat - b.repeat);
    if (!repeats.length) {
      pendingTaskIds.push(task.taskId);
      continue;
    }
    const classification = classifyTaskEligibility(repeats, DEFAULT_P6_1_ELIGIBILITY_RULE);
    classifications.push(classification);
    if (classification.capabilityClass === "pending") pendingTaskIds.push(task.taskId);
  }
  const combinedBank = buildCombinedEligibilityBank(classifications);
  const allTasksClassified = classifications.length === selectedTasks.length;
  result.classifications = classifications;
  result.pendingTaskIds = pendingTaskIds;
  result.nextPlannedRepeats = planEligibilityPhase(selectedTasks, result.repeatResults, "hold-continuation-safe").length;
  result.combinedBank = {
    ...combinedBank,
    freezeReady: combinedBank.freezeReady && allTasksClassified && pendingTaskIds.length === 0,
  };
  result.freezeReady = result.combinedBank.freezeReady;
  result.estimatedCostUsd = result.repeatResults.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);
  result.updatedAt = new Date().toISOString();
}

function holdPlanLength(selectedTasks: HeldOutTask[], repeats: P61ClassifiedRepeatResult[]): number {
  try {
    return planEligibilityPhase(selectedTasks, repeats, "hold-continuation").length;
  } catch {
    return 0;
  }
}

function writeResult(resultPath: string, result: EligibilityRunResult): void {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  const tmp = `${resultPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, resultPath);
}

function parsePhase(argv: string[]): EligibilityExecutionPhase {
  const token = argv.find((arg) => arg.startsWith("--phase="));
  const value = token?.slice("--phase=".length);
  if (value === "initial" || value === "hold-continuation") return value;
  throw new Error("--phase=initial or --phase=hold-continuation is required");
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
  return path.join(repoRoot, "runs", "_calibration", `p6-1-task-bank-eligibility-luna__${stamp}`, "result.json");
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
    status: "initial-running",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    model: MODEL,
    reasoningEffort: REASONING,
    condition: "AF",
    initialRepeatsPerTask: P6_1_INITIAL_REPEATS,
    maxAttemptsPerTask: P6_1_MAX_ATTEMPTS,
    executionManifest,
    eligibilityRule: FROZEN_ELIGIBILITY_RULE,
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
    nextPlannedRepeats: 0,
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
  if (result.schemaVersion !== RUN_SCHEMA_VERSION) throw new Error(`Resume schema mismatch: ${result.schemaVersion}`);
  assertResumeManifestEqual(result.executionManifest, currentManifest);
  if (result.taskBankVersion !== P6_1_TASK_BANK_VERSION ||
      result.failureClassificationVersion !== P6_1_FAILURE_CLASSIFICATION_VERSION ||
      result.artifactLayoutVersion !== ARTIFACT_LAYOUT_VERSION) {
    throw new Error("Resume refused: frozen version metadata changed");
  }
  assertResumeManifestEqual(result.eligibilityRule, FROZEN_ELIGIBILITY_RULE);
  if (result.initialRepeatsPerTask !== P6_1_INITIAL_REPEATS || result.maxAttemptsPerTask !== P6_1_MAX_ATTEMPTS) {
    throw new Error("Resume refused: repeat policy changed");
  }
  if (result.model !== MODEL || result.reasoningEffort !== REASONING || result.condition !== "AF") {
    throw new Error("Resume model/reasoning/condition mismatch");
  }
  if (result.taskBank.sha256 !== hashText(taskBankRaw)) throw new Error("Resume refused: heldout_tasks.json changed since run start");
  if (result.baselineRepository.sha256 !== hashRepository(repository)) throw new Error("Resume refused: baseline repository changed since run start");
  if (result.taskBank.totalTasks !== allTasks.length) throw new Error("Resume refused: task-bank size changed");
  const selected = selectedTasks.map((task) => task.taskId);
  if (JSON.stringify(result.taskBank.selectedRemainingTaskIds) !== JSON.stringify(selected)) {
    throw new Error("Resume refused: selected remaining task IDs changed");
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

async function executePlannedRepeat(
  repository: Record<string, string>,
  syntheticWorldDir: string,
  task: HeldOutTask,
  repeat: number,
  runDir: string,
  resultPath: string,
  result: EligibilityRunResult,
  selectedTasks: HeldOutTask[]
): Promise<void> {
  let execution: RepeatExecution;
  try {
    execution = await runTaskRepeat(repository, syntheticWorldDir, task, repeat);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    execution = {
      result: {
        taskId: task.taskId,
        taskType: task.type ?? null,
        repeat,
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
  const classified = classifyRepeat(execution.result);
  commitRepeatArtifactsAtomic(runDir, classified, execution.artifacts);
  result.repeatResults.push(classified);
  recomputeSafe(result, selectedTasks);
  writeResult(resultPath, result);
  console.log(
    `P6-1 ${classified.taskId} repeat=${classified.repeat} passed=${classified.passed} ` +
    `domain=${classified.failureDomain} validity=${classified.validity} ` +
    `category=${classified.failureCategory ?? "none"} cost=$${(classified.estimatedCostUsd ?? 0).toFixed(6)}`
  );
}

function recomputeSafe(result: EligibilityRunResult, selectedTasks: HeldOutTask[]): void {
  const classifications: P61TaskClassification[] = [];
  const pendingTaskIds: string[] = [];
  for (const task of selectedTasks) {
    const repeats = result.repeatResults.filter((item) => item.taskId === task.taskId).sort((a, b) => a.repeat - b.repeat);
    if (!repeats.length) {
      pendingTaskIds.push(task.taskId);
      continue;
    }
    const classification = classifyTaskEligibility(repeats, DEFAULT_P6_1_ELIGIBILITY_RULE);
    classifications.push(classification);
    if (classification.capabilityClass === "pending") pendingTaskIds.push(task.taskId);
  }
  const combinedBank = buildCombinedEligibilityBank(classifications);
  const allTasksClassified = classifications.length === selectedTasks.length;
  result.classifications = classifications;
  result.pendingTaskIds = pendingTaskIds;
  result.nextPlannedRepeats = holdPlanLength(selectedTasks, result.repeatResults);
  result.combinedBank = {
    ...combinedBank,
    freezeReady: combinedBank.freezeReady && allTasksClassified && pendingTaskIds.length === 0,
  };
  result.freezeReady = result.combinedBank.freezeReady;
  result.estimatedCostUsd = result.repeatResults.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);
  result.updatedAt = new Date().toISOString();
}

function initialHealthSummary(result: EligibilityRunResult, runDir: string, selectedTasks: HeldOutTask[]) {
  const initial = result.repeatResults.filter((item) => item.repeat <= P6_1_INITIAL_REPEATS);
  const missingArtifacts = initial.filter((item) => !repeatArtifactBundleComplete(runDir, item.taskId, item.repeat));
  return {
    expectedInitialRepeats: selectedTasks.length * P6_1_INITIAL_REPEATS,
    recordedInitialRepeats: initial.length,
    infrastructureInvalidCount: initial.filter((item) => item.failureDomain === "infrastructure").length,
    artifactMissingCount: missingArtifacts.length,
    pendingAfterInitial: result.pendingTaskIds,
    eligibilityRuleChangedAfterObservation: false,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const phase = parsePhase(argv);
  const repoRoot = path.resolve(__dirname, "..");
  assertTrackedWorktreeClean(repoRoot);

  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");
  const taskBankPath = path.join(syntheticWorldDir, "heldout_tasks.json");
  const taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const allTasks = JSON.parse(taskBankRaw) as HeldOutTask[];
  if (allTasks.length !== P6_1_EXPECTED_TASK_BANK_SIZE) {
    throw new Error(`Frozen P6-1 task-bank size mismatch: expected ${P6_1_EXPECTED_TASK_BANK_SIZE}, got ${allTasks.length}`);
  }
  const selectedTasks = selectRemainingEligibilityTasks(allTasks);
  const expectedRemaining = P6_1_EXPECTED_TASK_BANK_SIZE - P6_1_PILOT_TASK_IDS.length;
  if (selectedTasks.length !== expectedRemaining) throw new Error(`Expected ${expectedRemaining} remaining tasks, got ${selectedTasks.length}`);

  const repository: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repository);
  const executionManifest = buildExecutionManifest(repoRoot);
  const resumePath = parseResumePath(argv);

  console.log("P6-1 PHASE", phase);
  console.log("P6-1 FROZEN MANIFEST", JSON.stringify(executionManifest));
  console.log("P6-1 INITIAL REPEATS", selectedTasks.length * P6_1_INITIAL_REPEATS);
  console.log("P6-1 MAX ATTEMPTS", selectedTasks.length * P6_1_MAX_ATTEMPTS);

  if (phase === "hold-continuation" && !resumePath) {
    throw new Error("hold-continuation requires --resume <initial result.json>");
  }
  if (argv.includes("--dry-run")) {
    console.log("DRY RUN: no API calls made.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for live eligibility execution");

  const resultPath = resumePath ?? createResultPath(repoRoot);
  const runDir = path.dirname(resultPath);
  let result: EligibilityRunResult;
  if (resumePath) {
    result = JSON.parse(fs.readFileSync(resumePath, "utf8")) as EligibilityRunResult;
    validateResume(result, taskBankRaw, allTasks, selectedTasks, repository, executionManifest);
    const reconciliation = reconcileRepeatJournal(runDir, result.repeatResults);
    result.repeatResults = reconciliation.repeatResults as P61ClassifiedRepeatResult[];
    if (reconciliation.missingArtifactKeys.length || reconciliation.recoveredArtifactKeys.length) {
      console.log("P6-1 JOURNAL RECOVERY", JSON.stringify(reconciliation));
    }
    recomputeSafe(result, selectedTasks);
    writeResult(resultPath, result);
  } else {
    if (phase !== "initial") throw new Error("A new P6-1b run must start with --phase=initial");
    result = newResult(taskBankPath, taskBankRaw, allTasks, selectedTasks, repositoryDir, repository, executionManifest);
    writeResult(resultPath, result);
    console.log("RESULT", resultPath);
  }

  const taskById = new Map(selectedTasks.map((task) => [task.taskId, task]));

  if (phase === "initial") {
    if (result.status === "hold-running" || result.status === "completed") {
      throw new Error(`Cannot run initial phase from status=${result.status}`);
    }
    result.status = "initial-running";
    const plan = planEligibilityPhase(selectedTasks, result.repeatResults, "initial");
    for (const planned of plan) {
      const task = taskById.get(planned.taskId);
      if (!task) throw new Error(`Planned task missing: ${planned.taskId}`);
      await executePlannedRepeat(repository, syntheticWorldDir, task, planned.repeat, runDir, resultPath, result, selectedTasks);
    }
    assertInitialPhaseComplete(selectedTasks, result.repeatResults);
    recomputeSafe(result, selectedTasks);
    result.status = "initial-completed";
    result.completedAt = null;
    writeResult(resultPath, result);
    console.log("P6-1 INITIAL HEALTH", JSON.stringify(initialHealthSummary(result, runDir, selectedTasks)));
    console.log("RESULT", resultPath);
    console.log("STOP: initial phase completed. hold-continuation and P6-2 were not executed.");
    return;
  }

  if (result.status !== "initial-completed" && result.status !== "hold-running") {
    throw new Error(`hold-continuation requires initial-completed/hold-running status, got ${result.status}`);
  }
  assertInitialPhaseComplete(selectedTasks, result.repeatResults);
  result.status = "hold-running";
  writeResult(resultPath, result);

  while (true) {
    const plan = planEligibilityPhase(selectedTasks, result.repeatResults, "hold-continuation");
    if (!plan.length) break;
    for (const planned of plan) {
      const task = taskById.get(planned.taskId);
      if (!task) throw new Error(`Planned task missing: ${planned.taskId}`);
      await executePlannedRepeat(repository, syntheticWorldDir, task, planned.repeat, runDir, resultPath, result, selectedTasks);
    }
  }

  recomputeSafe(result, selectedTasks);
  result.status = "completed";
  result.completedAt = new Date().toISOString();
  result.updatedAt = result.completedAt;
  writeResult(resultPath, result);
  console.log("P6-1 FULL TASK-BANK CLASSIFICATIONS");
  for (const classification of result.classifications) console.log(JSON.stringify(classification));
  console.log("P6-1 COMBINED BANK", JSON.stringify(result.combinedBank));
  console.log(`P6-1 TOTAL COST $${result.estimatedCostUsd.toFixed(6)}`);
  console.log("RESULT", resultPath);
  console.log("STOP: P6-2 was not executed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("p6-task-bank-eligibility failed:", error);
    process.exit(1);
  });
}
'''

# Fix an intentionally avoided recursive helper typo after embedding.
runner = runner.replace('result.nextPlannedRepeats = planEligibilityPhase(selectedTasks, result.repeatResults, "hold-continuation-safe").length;\n', '')
runner = runner.replace('function recompute(result: EligibilityRunResult, selectedTasks: HeldOutTask[]): void {', 'function recomputeLegacyRemoved(result: EligibilityRunResult, selectedTasks: HeldOutTask[]): void {')
# Remove the now-unused legacy recompute function block entirely.
start = runner.find('function recomputeLegacyRemoved(')
end = runner.find('function holdPlanLength(', start)
if start >= 0 and end > start:
    runner = runner[:start] + runner[end:]

integration_test = r'''import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  assertResumeManifestEqual,
  commitRepeatArtifactsAtomic,
  planEligibilityPhase,
  reconcileRepeatJournal,
  REPEAT_ARTIFACT_FILES,
} from "./src/p6/task-bank-live-runtime";
import { P6_1_PILOT_TASK_IDS, selectRemainingEligibilityTasks } from "./src/p6/task-bank-eligibility";
import type { TaskRepeatLike } from "./src/p6/failure-classification";

const taskBankPath = path.resolve(__dirname, "../synthetic-world/heldout_tasks.json");
const tasks = JSON.parse(fs.readFileSync(taskBankPath, "utf8")) as Array<{ taskId: string; type?: string }>;
const remaining = selectRemainingEligibilityTasks(tasks);
assert.equal(remaining.length, 15);
assert.equal(P6_1_PILOT_TASK_IDS.length, 5);

const initial = planEligibilityPhase(remaining, [], "initial");
assert.equal(initial.length, 45, "initial phase must plan exactly 45 repeats");
assert(initial.every((item) => item.repeat >= 1 && item.repeat <= 3));

const manifest = {
  taskBankVersion: "v2",
  eligibilityRule: { semanticFloorMinFailures: 2, initialAttempts: 3, maxAttempts: 5 },
  maxOutputTokens: 7000,
};
assert.doesNotThrow(() => assertResumeManifestEqual(manifest, JSON.parse(JSON.stringify(manifest))));
assert.throws(
  () => assertResumeManifestEqual(manifest, { ...manifest, eligibilityRule: { ...manifest.eligibilityRule, semanticFloorMinFailures: 3 } }),
  /manifest changed/
);

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "p6-runner-hardening-"));
const journalResult = repeat("T-artifact", "local", 1, true);
commitRepeatArtifactsAtomic(runDir, journalResult, {
  rawResponse: "raw",
  modifiedFiles: { "src/x.ts": "export const x = 1;" },
  modelProvenance: { actualModel: "gpt-5.6-luna" },
  testResults: { visible: { passed: true } },
  agentExecutionStatus: "ok",
  agentError: null,
  runnerError: null,
});
const artifactDir = path.join(runDir, "T-artifact", "repeat-1");
for (const fileName of REPEAT_ARTIFACT_FILES) {
  assert(fs.existsSync(path.join(artifactDir, fileName)), `missing artifact ${fileName}`);
}
assert.deepStrictEqual(
  fs.readdirSync(artifactDir).sort(),
  [...REPEAT_ARTIFACT_FILES].sort(),
  "repeat artifact bundle must contain exactly the five journal files"
);

const orphanRecovery = reconcileRepeatJournal(runDir, [] as ReturnType<typeof repeat>[]);
assert.equal(orphanRecovery.repeatResults.length, 1, "artifact-only committed repeat must be recovered without rerun");
assert.deepStrictEqual(orphanRecovery.recoveredArtifactKeys, ["T-artifact#1"]);

fs.rmSync(path.join(artifactDir, "test_results.json"));
const missingRecovery = reconcileRepeatJournal(runDir, [journalResult]);
assert.equal(missingRecovery.repeatResults.length, 0, "recorded repeat with incomplete artifacts must be removed for rerun");
assert.deepStrictEqual(missingRecovery.missingArtifactKeys, ["T-artifact#1"]);

const holdTasks = [
  { taskId: "T-pending", type: "local" },
  { taskId: "T-eligible", type: "local" },
];
const afterInitial: TaskRepeatLike[] = [
  repeat("T-pending", "local", 1, true),
  repeat("T-pending", "local", 2, false, "output-parse", "output-parse-failure", "parse"),
  repeat("T-pending", "local", 3, false, "test-failure", "ok", "visible:execution:tsc failed"),
  repeat("T-eligible", "local", 1, true),
  repeat("T-eligible", "local", 2, true),
  repeat("T-eligible", "local", 3, true),
];
assert.deepStrictEqual(
  planEligibilityPhase(holdTasks, afterInitial, "hold-continuation"),
  [{ taskId: "T-pending", repeat: 4 }],
  "hold continuation must schedule only pending tasks"
);
const afterFour = [
  ...afterInitial,
  repeat("T-pending", "local", 4, false, "output-parse", "output-parse-failure", "parse"),
];
assert.deepStrictEqual(
  planEligibilityPhase(holdTasks, afterFour, "hold-continuation"),
  [{ taskId: "T-pending", repeat: 5 }]
);

fs.rmSync(runDir, { recursive: true, force: true });
console.log("P6-1b runner hardening integration verified: exact initial 45, frozen resume manifest, atomic 5-file journal/recovery, and pending-only hold continuation.");

function repeat(
  taskId: string,
  taskType: string,
  repeatNo: number,
  passed: boolean,
  failureCategory: string | null = null,
  executionStatus = "ok",
  failureReason: string | null = null
) {
  return {
    taskId,
    taskType,
    repeat: repeatNo,
    passed,
    validity: "valid",
    failureCategory,
    executionStatus,
    failureReason,
  };
}
'''

(ROOT / 'harness/src/p6/task-bank-live-runtime.ts').write_text(runtime, encoding='utf-8')
(ROOT / 'harness/p6-task-bank-eligibility-live.ts').write_text(runner, encoding='utf-8')
(ROOT / 'harness/verify-p6-task-bank-eligibility-runner.ts').write_text(integration_test, encoding='utf-8')

# package.json: explicit production command plus backwards-compatible alias and new verification.
pkg_path = ROOT / 'harness/package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
scripts = pkg['scripts']
scripts['p6:task-bank-eligibility'] = 'DOTENV_CONFIG_PATH=.env ts-node -r dotenv/config p6-task-bank-eligibility-live.ts'
scripts['p6:task-bank-eligibility-live'] = 'npm run p6:task-bank-eligibility --'
scripts['verify:p6-task-bank-eligibility-runner'] = 'ts-node verify-p6-task-bank-eligibility-runner.ts'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Ignore generated calibration journals so clean-worktree gating remains usable after live execution.
gitignore_path = ROOT / '.gitignore'
gitignore = gitignore_path.read_text(encoding='utf-8')
if 'runs/_calibration/' not in gitignore:
    gitignore = gitignore.replace('runs/_smoke/\n', 'runs/_smoke/\nruns/_calibration/\n')
gitignore_path.write_text(gitignore, encoding='utf-8')

# Add runner-level offline integration to normal CI.
ci_path = ROOT / '.github/workflows/harness-ci.yml'
ci = ci_path.read_text(encoding='utf-8')
needle = '''      - name: Verify P6 full task-bank eligibility planning\n        working-directory: harness\n        run: npm run verify:p6-task-bank-eligibility\n'''
addition = needle + '''      - name: Verify P6 task-bank live runner hardening offline\n        working-directory: harness\n        run: npm run verify:p6-task-bank-eligibility-runner\n'''
if 'Verify P6 task-bank live runner hardening offline' not in ci:
    if needle not in ci:
        raise SystemExit('CI insertion anchor not found')
    ci = ci.replace(needle, addition)
ci_path.write_text(ci, encoding='utf-8')

# Stage 1 plan: predeclare two execution phases, health-only stop, stronger freeze, and journal recovery.
stage_path = ROOT / 'docs/stage1_plan.md'
stage = stage_path.read_text(encoding='utf-8')
old = r'''#### attempt / hold終了規則

各taskは初期3 attemptを必ず実行する。protocol/system/other failureによりsemantic-evaluable evidenceが不足し、3 attempt後もterminal classificationに到達しない場合のみ追加attemptを許可する。追加は最大2回、したがって**1 taskあたり最大5 attempt**、15 task全体では初期45 attempt・最大75 attemptを上限とする。
'''
new = r'''#### execution phase分離（initial 45 → explicit hold continuation）

P6-1b live executionは1回のrunner呼び出しで最大75 attemptまで連続実行しない。次の2 phaseを明示的に分離する。

- `npm run p6:task-bank-eligibility -- --phase=initial`：残り15 task × 3 repeat、**計45 repeatだけ**を実行し、45回到達時に必ず停止する。途中停止からの再開は同phaseに`--resume <result.json>`を付ける。
- `npm run p6:task-bank-eligibility -- --phase=hold-continuation --resume <result.json>`：initial phase完了後に別途明示起動し、事前固定規則で`pending`になったtaskだけをrepeat 4→5へ機械的に進める。

initial 45停止時に確認してよいのは、infrastructure-invalid件数、repeat artifact欠損、journal recovery件数などの**実行健全性だけ**である。45回の結果を見てeligibility閾値、task role、追加repeat対象、max attemptを変更しない。hold-continuationの対象は事前規則から機械的に決め、人間が成績を見て選別しない。

#### attempt / hold終了規則

各taskはinitial phaseで3 attemptを必ず実行する。protocol/system/other failureによりsemantic-evaluable evidenceが不足し、3 attempt後もterminal classificationに到達しない場合のみ、明示的なhold-continuation phaseで追加attemptを許可する。追加は最大2回、したがって**1 taskあたり最大5 attempt**、15 task全体では初期45 attempt・最大75 attemptを上限とする。
'''
if old not in stage:
    raise SystemExit('stage1 attempt anchor not found')
stage = stage.replace(old, new)

old_resume = r'''#### resume freeze / provenance

run開始時にtask bank SHA、baseline repository SHAに加えて、以下をmanifestへ固定する。

- git SHA
- OpenAI `promptVersion` / `promptHash`
- OpenAI `schemaVersion` / `schemaHash`
- eligibility runner SHA256
- runner / OpenAI backend / prompt-schema / classification / scoring等のcritical source fingerprint

resume時にいずれかが不一致なら同一runへの追記を拒否する。
'''
new_resume = r'''#### resume freeze / provenance

scientific live開始時はtracked worktreeがcleanであることをgateとし、未commitのtracked変更があれば開始を拒否する。`runs/_calibration/`はgenerated artifactとしてgitignore対象にする。

run開始時にtask bank SHA、baseline repository SHAに加えて、以下をmanifestへ固定する。

- git SHA
- `taskBankVersion` / `failureClassificationVersion` / `artifactLayoutVersion`
- eligibility rule全体、`initialRepeatsPerTask`、`maxAttemptsPerTask`
- model / reasoning / `maxOutputTokens` / timeout / retry / service tier / cache mode
- OpenAI `promptVersion` / `promptHash`
- OpenAI `schemaVersion` / `schemaHash`
- OpenAI SDK version / Node version
- eligibility runner SHA256
- runner / OpenAI backend / prompt-schema / classification / scoring / live-runtime等のcritical source fingerprint

resume時にいずれかが不一致なら同一runへの追記を拒否する。
'''
if old_resume not in stage:
    raise SystemExit('stage1 resume anchor not found')
stage = stage.replace(old_resume, new_resume)

old_art = r'''#### repeat artifact保存

各repeatについて`result.json`とは別に、run directory配下の`<taskId>/repeat-N/`へ少なくとも以下を保存する。

- `agent_response.txt`：raw response
- `modified_files.json`：生成された変更内容
- `model_provenance.json`：model / prompt / schema / SDK等のprovenance
- `test_results.json`：visible / hidden / task-specific / protocol判定
- `repeat_meta.json`：execution status / normalized error / runner error

これにより、後からsemantic failureの具体的原因を再監査できるようにする。
'''
new_art = r'''#### repeat artifact journal / recovery

各repeatについて`result.json`とは別に、run directory配下の`<taskId>/repeat-N/`へ以下の5ファイルを保存する。

- `agent_response.txt`：raw response
- `modified_files.json`：生成された変更内容
- `model_provenance.json`：model / prompt / schema / SDK等のprovenance
- `test_results.json`：visible / hidden / task-specific / protocol判定
- `repeat_meta.json`：repeat result本体、execution status / normalized error / runner error

5ファイルは一時directoryへ書き切った後、directory renameでatomic commitする。`repeat_meta.json`はjournal entryとして、artifact commit後・`result.json`更新前にクラッシュしたrepeatをAPI再実行なしで復旧できる情報を持つ。

resume時は`result.json`とartifact journalを照合する。

- `result.json`にrepeatがあるのに5ファイルのどれかが欠ける場合：そのrepeatを記録から外し、該当phaseの再実行対象へ戻す。
- 5ファイルが完全にcommit済みだが`result.json`にrepeatがない場合：`repeat_meta.json`からrepeat resultを復旧し、重複API callを避ける。
- incompleteな一時/partial artifact directoryは研究データとして採用しない。

これにより、semantic failureの具体的原因を再監査できるだけでなく、resume時の二重課金と不完全artifact採用を避ける。
'''
if old_art not in stage:
    raise SystemExit('stage1 artifact anchor not found')
stage = stage.replace(old_art, new_art)
stage_path.write_text(stage, encoding='utf-8')

# Experiment plan: make eligibility explicitly two-axis.
exp_path = ROOT / 'docs/experiment_plan.md'
exp = exp_path.read_text(encoding='utf-8')
old_exp = r'''**Primary task eligibility**：Stage 0.5では旧modelでArtifact-Fullでも恒常失敗するtaskが存在したため、既存20 taskを機械的にすべてprimary \(M\) へ入れない。primary model移行後、main comparisonとは独立したcalibration runでtask適格性を判定し、次をfreezeする。

- \(\mathcal T_{primary}\)：AFで非floor、system/compiler failure主体でない、measurement leakageがないtask
- \(\mathcal T_{challenge}\)：AFでも難しいが診断価値を持つtask
- task bank構成Aをprimary、構成B（invariant-stressingを含む）をdiagnosticとして扱う

閾値・repeat数・除外理由は結果観測後に変更しない。
'''
new_exp = r'''**Primary task eligibility**：Stage 0.5では旧modelでArtifact-Fullでも恒常失敗するtaskが存在したため、既存20 taskを機械的にすべてprimary \(M\) へ入れない。primary model移行後、main comparisonとは独立したcalibration runでtask適格性を判定する。判定は**能力上のclassと分析上のroleを別軸**としてfreezeする。

- `capabilityClass ∈ {eligible, semantic-floor, AF-unstable, invalid}`（実行途中のみ`pending`を許す）
- `analysisRole ∈ {main, diagnostic}`
- `taskType = invariant_stressing`は`analysisRole = diagnostic`、その他は`main`
- \(\mathcal T_{primary}=\{t\mid capabilityClass(t)=eligible \land analysisRole(t)=main\}\)
- `eligible ∩ diagnostic`はprimary outcomeへ混ぜずdiagnosticとして別集計する
- `semantic-floor`と`AF-unstable`はchallengeとして保持するが、同一カテゴリに潰さず別々に記録する
- `invalid`はprovider/harness failure過多または最大attempt到達後もsemantic evidence不足のtaskとして、能力floorとは分離する

P6-1bは残り15 taskについてinitial 3 repeat（45回）で一度必ず停止し、停止時の確認は実行健全性に限定する。追加repeatが必要な`pending` taskだけを、別の明示的hold-continuation phaseで事前固定規則に従い最大5 attemptまで機械的に進める。閾値・repeat上限・role・追加対象の規則は結果観測後に変更しない。
'''
if old_exp not in exp:
    raise SystemExit('experiment eligibility anchor not found')
exp = exp.replace(old_exp, new_exp)
exp_path.write_text(exp, encoding='utf-8')

print('P6-1b execution hardening patch applied.')
