import * as childProcess from "child_process";
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
