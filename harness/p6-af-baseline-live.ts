import * as childProcess from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import {
  assertStage1ProbeBankValid,
  generateStage1Probes,
  STAGE1_BOOLEAN_DESIGN_VERSION,
} from "../calibration/src/stage1-probes";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import { scoreProbes } from "../calibration/src/probe-scorer";
import type { GroundTruth, NamingScheme } from "../synthetic-world/schema";
import { OpenAIBackend } from "./src/agent-backend/openai";
import {
  OPENAI_MUTATION_SCHEMA_VERSION,
  OPENAI_PROMPT_HASH,
  OPENAI_PROMPT_VERSION,
  OPENAI_SCHEMA_HASH,
  buildOpenAIStructuredResponseRequestBody,
  estimateOpenAICostUsd,
  extractOutputText,
  extractRefusal,
  getPackageVersion,
  responseFailureDetails,
} from "./src/agent-backend/openai/shared";
import type { AgentResult } from "./src/agent-backend/types";
import {
  P6_2_AF_BASELINE_VERSION,
  P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS,
  P6_2_FAILURE_CLASSIFICATION_VERSION,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_SEMANTIC_FLOOR_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
  validateP62RepeatCount,
  type P62MRepeatLike,
  type P62TaskRole,
} from "./src/p6/af-baseline";
import {
  assertResumeManifestEqual,
  assertTrackedWorktreeClean,
  commitRepeatArtifactsAtomic,
  reconcileRepeatJournal,
  type RepeatArtifactBundle,
} from "./src/p6/task-bank-live-runtime";
import { isCensoredAgentExecutionStatus } from "./src/run-validity";
import { runScoring } from "./src/scoring";
import type { TestSuiteResult, TokenUsage } from "./src/types";

export const P6_2_MODEL = "gpt-5.6-luna";
export const P6_2_REASONING = "high" as const;
export const P6_2_CONDITION = "AF" as const;
export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v2";
export const P6_2_ARTIFACT_LAYOUT_VERSION = "p6-2-af-baseline-artifacts-v2";
export const P6_2_PROBE_SCHEMA_VERSION = "p6-2-af-boolean-answers-v1";
export const P6_2_PROBE_PROMPT_VERSION = "p6-2-af-probe-prompt-v1";

const MAX_OUTPUT_TOKENS = 7000;
const PROBE_MAX_OUTPUT_TOKENS = 8000;
const REQUEST_TIMEOUT_MS = 180000;
const MAX_RETRIES = 2;
const SERVICE_TIER = "default" as const;
const PROMPT_CACHE_MODE = "implicit" as const;

const CRITICAL_SOURCE_FILES = [
  "harness/p6-af-baseline-live.ts",
  "harness/src/p6/af-baseline.ts",
  "harness/src/p6/task-bank-live-runtime.ts",
  "harness/src/p6/failure-classification.ts",
  "harness/src/p6/task-bank-eligibility.ts",
  "harness/src/agent-backend/openai.ts",
  "harness/src/agent-backend/openai/shared.ts",
  "harness/src/agent-backend/package-version.ts",
  "harness/src/run-validity.ts",
  "harness/src/scoring.ts",
  "calibration/src/stage1-probes.ts",
  "calibration/src/probe-scorer.ts",
] as const;

interface HeldOutTask {
  taskId: string;
  type?: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

interface MRepeatResult {
  taskId: string;
  taskType: string | null;
  role: P62TaskRole;
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

type ClassifiedMRepeatResult = MRepeatResult & P62MRepeatLike;

interface MRepeatExecution {
  result: MRepeatResult;
  artifacts: RepeatArtifactBundle;
}

export type P62RSemFailureDomain = "none" | "semantic" | "protocol" | "system" | "infrastructure";

export interface P62RSemModelProvenance {
  provider: "openai";
  requestedModel: typeof P6_2_MODEL;
  actualModel: string | null;
  responseId: string | null;
  responseStatus: string | null;
  reasoningEffort: typeof P6_2_REASONING;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  sdkVersion: string | null;
  providerErrorCode: string | null;
}

export interface RSemProbeRepeatResult {
  repeat: number;
  designVersion: string;
  executionStatus: string;
  validity: "valid" | "infrastructure-invalid";
  failureDomain: P62RSemFailureDomain;
  failureReason: string | null;
  rawResponse: string;
  modelProvenance: P62RSemModelProvenance;
  booleanCorrect: number | null;
  booleanTotal: number;
  booleanAccuracy: number | null;
  probeDetails: Array<{
    probeId: string;
    correct: boolean;
    agentAnswer: string;
    correctAnswer: string;
    parseError?: string;
  }>;
  actualModel: string | null;
  usage: TokenUsage;
  estimatedCostUsd: number | null;
}

export interface P62ExecutionManifest {
  gitSha: string;
  baselineVersion: typeof P6_2_AF_BASELINE_VERSION;
  taskBankVersion: typeof P6_2_TASK_BANK_VERSION;
  failureClassificationVersion: typeof P6_2_FAILURE_CLASSIFICATION_VERSION;
  artifactLayoutVersion: typeof P6_2_ARTIFACT_LAYOUT_VERSION;
  model: typeof P6_2_MODEL;
  reasoningEffort: typeof P6_2_REASONING;
  condition: typeof P6_2_CONDITION;
  repeatCount: number;
  repeatCountSource: "runtime-argument-pre-freeze";
  maxOutputTokens: number;
  probeMaxOutputTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  serviceTier: typeof SERVICE_TIER;
  promptCacheMode: typeof PROMPT_CACHE_MODE;
  mutationPromptVersion: string;
  mutationPromptHash: string;
  mutationSchemaVersion: string;
  mutationSchemaHash: string;
  probeDesignVersion: string;
  probePromptVersion: string;
  probePromptTemplateHash: string;
  probeSchemaVersion: string;
  probeSchemaHash: string;
  openAiSdkVersion: string;
  nodeVersion: string;
  taskBankSha256: string;
  baselineRepositorySha256: string;
  groundTruthSha256: string;
  namingSchemesSha256: string;
  booleanProbeBankSha256: string;
  runnerSha256: string;
  codeFingerprintSha256: string;
  criticalSourceFiles: string[];
}

export interface P62AfBaselineResult {
  schemaVersion: typeof P6_2_RUN_SCHEMA_VERSION;
  artifactLayoutVersion: typeof P6_2_ARTIFACT_LAYOUT_VERSION;
  baselineVersion: typeof P6_2_AF_BASELINE_VERSION;
  status: "running" | "needs-audit" | "completed";
  auditFlags: Array<{
    measurement: "M" | "Rsem";
    taskId: string | null;
    repeat: number;
    failureDomain: string;
    executionStatus: string;
    reason: string | null;
  }>;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  model: typeof P6_2_MODEL;
  reasoningEffort: typeof P6_2_REASONING;
  condition: typeof P6_2_CONDITION;
  repeatCount: number;
  executionManifest: P62ExecutionManifest;
  taskBank: {
    path: string;
    version: typeof P6_2_TASK_BANK_VERSION;
    sha256: string;
    totalTasks: number;
  };
  baselineRepository: {
    path: string;
    sha256: string;
    fileCount: number;
  };
  measurements: {
    M: {
      primaryTaskIds: string[];
      eligibleDiagnosticTaskIds: string[];
      excludedSemanticFloorTaskIds: string[];
      repeatResults: ClassifiedMRepeatResult[];
      summary: ReturnType<typeof summarizeP62M>;
    };
    Rsem: {
      designVersion: string;
      booleanProbeIds: string[];
      constantAnswerBaseline: number;
      repeatResults: RSemProbeRepeatResult[];
      meanBooleanAccuracy: number | null;
    };
  };
  estimatedCostUsd: number;
}

interface ProbeMaterial {
  groundTruthRaw: string;
  namingSchemesRaw: string;
  booleanProbes: GeneratedProbe[];
  probeBankSha256: string;
  probeSchemaHash: string;
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

function hashText(text: string | Buffer): string {
  return crypto.createHash("sha256").update(text).digest("hex");
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
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(repoRoot, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function probePromptTemplateHash(): string {
  return hashText(
    `${P6_2_PROBE_PROMPT_VERSION}\nREPOSITORY FILES:<full AF repository>\nQUESTIONS:<opaque boolean probe IDs + neutral relation prompts>\n` +
    `instruction:answer semantic probes from supplied repository evidence; forced-choice true/false`
  );
}

function probePrompt(contextFiles: Record<string, string>, probes: GeneratedProbe[]): string {
  const repo = Object.keys(contextFiles).sort().map((filePath) => `\n--- ${filePath} ---\n${contextFiles[filePath]}`).join("");
  const questions = probes.map((probe) => [
    `[${probe.probeId}] (boolean)`,
    probe.prompt,
    'Answer exactly "true" or "false".',
  ].join("\n")).join("\n\n");
  return `REPOSITORY FILES:${repo}\n\nQUESTIONS:\n${questions}\n\nReturn one string answer for every exact probe ID.`;
}

function loadProbeMaterial(syntheticWorldDir: string): ProbeMaterial {
  const groundTruthPath = path.join(syntheticWorldDir, "ground_truth.json");
  const namingSchemesPath = path.join(syntheticWorldDir, "naming_schemes.json");
  const groundTruthRaw = fs.readFileSync(groundTruthPath, "utf8");
  const namingSchemesRaw = fs.readFileSync(namingSchemesPath, "utf8");
  const groundTruth = JSON.parse(groundTruthRaw) as GroundTruth;
  const schemes = JSON.parse(namingSchemesRaw) as NamingScheme[];
  const scheme = schemes.find((candidate) => candidate.schemeId === "A-obfuscated");
  if (!scheme) throw new Error("P6-2 requires A-obfuscated naming scheme");
  const visibleTestPath = path.join(syntheticWorldDir, "repository/tests/rules.visible.test.ts");
  const probes = generateStage1Probes(groundTruth, scheme, visibleTestPath);
  const audit = assertStage1ProbeBankValid(probes);
  if (audit.booleanTotal !== 12 || audit.booleanTrue !== 6 || audit.booleanFalse !== 6) {
    throw new Error(`P6-2 requires balanced 12-probe boolean bank, got ${audit.booleanTrue}/${audit.booleanFalse}`);
  }
  const booleanProbes = probes.filter((probe) => probe.type === "boolean");
  if (STAGE1_BOOLEAN_DESIGN_VERSION !== "stage1-neutral-relation-v2") {
    throw new Error(`Unexpected Stage 1 boolean design: ${STAGE1_BOOLEAN_DESIGN_VERSION}`);
  }
  const schema = {
    type: "object",
    properties: Object.fromEntries(booleanProbes.map((probe) => [probe.probeId, { type: "string" }])),
    required: booleanProbes.map((probe) => probe.probeId),
    additionalProperties: false,
  };
  return {
    groundTruthRaw,
    namingSchemesRaw,
    booleanProbes,
    probeBankSha256: hashText(stableJson(booleanProbes)),
    probeSchemaHash: hashText(stableJson(schema)),
  };
}

export function buildP62ExecutionManifest(args: {
  repoRoot: string;
  repeatCount: number;
  taskBankSha256: string;
  baselineRepositorySha256: string;
  probeMaterial: ProbeMaterial;
}): P62ExecutionManifest {
  const repeatCount = validateP62RepeatCount(args.repeatCount);
  const openAiSdkVersion = getPackageVersion("openai");
  if (!openAiSdkVersion) throw new Error("P6-2 requires non-null OpenAI SDK version provenance");
  const runnerPath = path.join(args.repoRoot, "harness/p6-af-baseline-live.ts");
  return {
    gitSha: childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: args.repoRoot, encoding: "utf8" }).trim(),
    baselineVersion: P6_2_AF_BASELINE_VERSION,
    taskBankVersion: P6_2_TASK_BANK_VERSION,
    failureClassificationVersion: P6_2_FAILURE_CLASSIFICATION_VERSION,
    artifactLayoutVersion: P6_2_ARTIFACT_LAYOUT_VERSION,
    model: P6_2_MODEL,
    reasoningEffort: P6_2_REASONING,
    condition: P6_2_CONDITION,
    repeatCount,
    repeatCountSource: "runtime-argument-pre-freeze",
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    probeMaxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    serviceTier: SERVICE_TIER,
    promptCacheMode: PROMPT_CACHE_MODE,
    mutationPromptVersion: OPENAI_PROMPT_VERSION,
    mutationPromptHash: OPENAI_PROMPT_HASH,
    mutationSchemaVersion: OPENAI_MUTATION_SCHEMA_VERSION,
    mutationSchemaHash: OPENAI_SCHEMA_HASH,
    probeDesignVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    probePromptVersion: P6_2_PROBE_PROMPT_VERSION,
    probePromptTemplateHash: probePromptTemplateHash(),
    probeSchemaVersion: P6_2_PROBE_SCHEMA_VERSION,
    probeSchemaHash: args.probeMaterial.probeSchemaHash,
    openAiSdkVersion,
    nodeVersion: process.version,
    taskBankSha256: args.taskBankSha256,
    baselineRepositorySha256: args.baselineRepositorySha256,
    groundTruthSha256: hashText(args.probeMaterial.groundTruthRaw),
    namingSchemesSha256: hashText(args.probeMaterial.namingSchemesRaw),
    booleanProbeBankSha256: args.probeMaterial.probeBankSha256,
    runnerSha256: hashText(fs.readFileSync(runnerPath)),
    codeFingerprintSha256: hashCriticalSources(args.repoRoot),
    criticalSourceFiles: [...CRITICAL_SOURCE_FILES],
  };
}

export function createP62Result(args: {
  taskBankPath: string;
  taskBankRaw: string;
  tasks: HeldOutTask[];
  repositoryPath: string;
  repository: Record<string, string>;
  repeatCount: number;
  manifest: P62ExecutionManifest;
  booleanProbeIds: string[];
}): P62AfBaselineResult {
  const selection = selectP62TaskBank(args.tasks);
  const now = new Date().toISOString();
  return {
    schemaVersion: P6_2_RUN_SCHEMA_VERSION,
    artifactLayoutVersion: P6_2_ARTIFACT_LAYOUT_VERSION,
    baselineVersion: P6_2_AF_BASELINE_VERSION,
    status: "running",
    auditFlags: [],
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    model: P6_2_MODEL,
    reasoningEffort: P6_2_REASONING,
    condition: P6_2_CONDITION,
    repeatCount: validateP62RepeatCount(args.repeatCount),
    executionManifest: args.manifest,
    taskBank: {
      path: args.taskBankPath,
      version: P6_2_TASK_BANK_VERSION,
      sha256: hashText(args.taskBankRaw),
      totalTasks: args.tasks.length,
    },
    baselineRepository: {
      path: args.repositoryPath,
      sha256: hashRepository(args.repository),
      fileCount: Object.keys(args.repository).length,
    },
    measurements: {
      M: {
        primaryTaskIds: selection.primary.map((task) => task.taskId),
        eligibleDiagnosticTaskIds: selection.diagnostic.map((task) => task.taskId),
        excludedSemanticFloorTaskIds: [...P6_2_SEMANTIC_FLOOR_TASK_IDS],
        repeatResults: [],
        summary: summarizeP62M([]),
      },
      Rsem: {
        designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
        booleanProbeIds: [...args.booleanProbeIds],
        constantAnswerBaseline: 0.5,
        repeatResults: [],
        meanBooleanAccuracy: null,
      },
    },
    estimatedCostUsd: 0,
  };
}

export function assertP62ResumeCompatible(
  result: P62AfBaselineResult,
  expectedManifest: P62ExecutionManifest,
  taskBankRaw: string,
  repository: Record<string, string>
): void {
  if (result.schemaVersion !== P6_2_RUN_SCHEMA_VERSION ||
      result.artifactLayoutVersion !== P6_2_ARTIFACT_LAYOUT_VERSION ||
      result.baselineVersion !== P6_2_AF_BASELINE_VERSION) {
    throw new Error("Resume refused: P6-2 result version metadata changed");
  }
  assertResumeManifestEqual(result.executionManifest, expectedManifest);
  if (result.taskBank.version !== P6_2_TASK_BANK_VERSION || result.taskBank.sha256 !== hashText(taskBankRaw)) {
    throw new Error("Resume refused: P6-2 task bank changed");
  }
  if (result.baselineRepository.sha256 !== hashRepository(repository)) {
    throw new Error("Resume refused: P6-2 baseline repository changed");
  }
  if (result.repeatCount !== expectedManifest.repeatCount) throw new Error("Resume refused: P6-2 repeat count changed");
  if (stableJson(result.measurements.M.primaryTaskIds) !== stableJson([...P6_2_PRIMARY_TASK_IDS]) ||
      stableJson(result.measurements.M.eligibleDiagnosticTaskIds) !== stableJson([...P6_2_ELIGIBLE_DIAGNOSTIC_TASK_IDS]) ||
      stableJson(result.measurements.M.excludedSemanticFloorTaskIds) !== stableJson([...P6_2_SEMANTIC_FLOOR_TASK_IDS])) {
    throw new Error("Resume refused: P6-2 frozen task selection changed");
  }
}

function recomputeResult(result: P62AfBaselineResult): void {
  result.measurements.M.summary = summarizeP62M(result.measurements.M.repeatResults);
  const r = result.measurements.Rsem.repeatResults;
  const validR = r.filter((item) =>
    item.validity === "valid" && item.failureDomain === "none" && item.booleanAccuracy !== null
  );
  result.measurements.Rsem.meanBooleanAccuracy = validR.length
    ? validR.reduce((sum, item) => sum + (item.booleanAccuracy ?? 0), 0) / validR.length
    : null;
  result.estimatedCostUsd =
    result.measurements.M.repeatResults.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0) +
    r.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);
  result.updatedAt = new Date().toISOString();
}

function suiteDigest(suite: TestSuiteResult) {
  return {
    passed: suite.passed,
    numPassed: suite.numPassed,
    numFailed: suite.numFailed,
    executionError: suite.executionError ?? null,
    failedCases: suite.testCases.filter((item) => !item.passed).map((item) => ({
      testName: item.testName,
      error: item.error ?? null,
    })),
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

function validateMutationPaths(files: Record<string, string>): string | null {
  for (const raw of Object.keys(files)) {
    const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) return `write-escape:${raw}`;
    if (!(normalized.startsWith("src/") || normalized.startsWith("tests/"))) return `write-outside-repository-contract:${raw}`;
  }
  return null;
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

async function runMRepeat(
  repository: Record<string, string>,
  syntheticWorldDir: string,
  task: HeldOutTask,
  role: P62TaskRole,
  repeat: number
): Promise<MRepeatExecution> {
  const backend = new OpenAIBackend({
    model: P6_2_MODEL,
    reasoningEffort: P6_2_REASONING,
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

  const base = {
    taskId: task.taskId,
    taskType: task.type ?? null,
    role,
    repeat,
    modifiedPaths,
    workingNote: agent.explicitWorkingNote,
    actualModel: agent.modelProvenance.actualModel,
    usage: agent.tokenUsage ?? null,
    estimatedCostUsd: agent.estimatedCostUsd ?? null,
  };

  if (agent.executionStatus !== "ok") {
    const invalid = isCensoredAgentExecutionStatus(agent.executionStatus) || agent.error?.category === "provider";
    return {
      result: {
        ...base,
        passed: false,
        validity: invalid ? "infrastructure-invalid" : "valid",
        failureCategory: agent.error?.category ?? agent.executionStatus,
        failureReason: agent.error?.message ?? agent.executionStatus,
        executionStatus: agent.executionStatus,
        visible: null,
        hidden: null,
        taskSpecific: null,
        protocolContractViolated: null,
      },
      artifacts: artifactBundleFromAgent(agent, emptyTests),
    };
  }

  const pathError = validateMutationPaths(agent.modifiedFiles);
  if (pathError) {
    return {
      result: {
        ...base,
        passed: false,
        validity: "valid",
        failureCategory: "mutation-validation",
        failureReason: pathError,
        executionStatus: "mutation-validation-failure",
        visible: null,
        hidden: null,
        taskSpecific: null,
        protocolContractViolated: null,
      },
      artifacts: artifactBundleFromAgent(agent, emptyTests),
    };
  }

  const merged = { ...repository, ...agent.modifiedFiles };
  try {
    const scoring = await runScoring(merged, syntheticWorldDir, task.taskSpecificTestCode);
    const visible = suiteDigest(scoring.visibleTests);
    const hidden = suiteDigest(scoring.hiddenTests);
    const taskSpecific = scoring.taskSpecificTests ? suiteDigest(scoring.taskSpecificTests) : null;
    const passed = scoring.visibleTests.passed && scoring.hiddenTests.passed &&
      (scoring.taskSpecificTests?.passed ?? true) && !scoring.protocolContractViolated;
    return {
      result: {
        ...base,
        passed,
        validity: "valid",
        failureCategory: passed ? null : scoring.protocolContractViolated ? "protocol-contract" : "test-failure",
        failureReason: passed ? null : failureReasonFromSuites(scoring.visibleTests, scoring.hiddenTests, scoring.taskSpecificTests),
        executionStatus: agent.executionStatus,
        visible,
        hidden,
        taskSpecific,
        protocolContractViolated: scoring.protocolContractViolated,
      },
      artifacts: artifactBundleFromAgent(agent, { visible, hidden, taskSpecific, protocolContractViolated: scoring.protocolContractViolated }),
    };
  } catch (error) {
    const runnerError = error instanceof Error ? error.stack ?? error.message : String(error);
    return {
      result: {
        ...base,
        passed: false,
        validity: "infrastructure-invalid",
        failureCategory: "harness",
        failureReason: runnerError,
        executionStatus: agent.executionStatus,
        visible: null,
        hidden: null,
        taskSpecific: null,
        protocolContractViolated: null,
      },
      artifacts: artifactBundleFromAgent(agent, emptyTests, runnerError),
    };
  }
}

function addUsage(target: TokenUsage, usage: any): void {
  if (!usage) return;
  target.input += usage.input_tokens ?? 0;
  target.output += usage.output_tokens ?? 0;
  target.cachedInput = (target.cachedInput ?? 0) + (usage.input_tokens_details?.cached_tokens ?? 0);
  target.cacheWriteInput = (target.cacheWriteInput ?? 0) + (usage.input_tokens_details?.cache_write_tokens ?? 0);
  target.reasoningOutput = (target.reasoningOutput ?? 0) + (usage.output_tokens_details?.reasoning_tokens ?? 0);
  target.total = (target.total ?? 0) + (usage.total_tokens ?? 0);
}

function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 };
}

export interface P62ProbeClient {
  responses: { create(body: any): Promise<any> };
}

export type P62ProbeClientFactory = (options: { timeout: number; maxRetries: number }) => P62ProbeClient;

const defaultProbeClientFactory: P62ProbeClientFactory = (options) => new OpenAI(options) as P62ProbeClient;

function probeModelProvenance(response: any | null, providerErrorCode: string | null = null): P62RSemModelProvenance {
  return {
    provider: "openai",
    requestedModel: P6_2_MODEL,
    actualModel: response?.model ?? null,
    responseId: response?.id ?? null,
    responseStatus: response?.status ?? (providerErrorCode ? "provider-error" : null),
    reasoningEffort: P6_2_REASONING,
    maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    sdkVersion: getPackageVersion("openai"),
    providerErrorCode,
  };
}

function probeFailure(args: {
  repeat: number;
  executionStatus: string;
  validity: "valid" | "infrastructure-invalid";
  failureDomain: P62RSemFailureDomain;
  failureReason: string;
  rawResponse: string;
  response: any | null;
  usage: TokenUsage;
  estimatedCostUsd: number | null;
  booleanTotal: number;
  probeDetails?: RSemProbeRepeatResult["probeDetails"];
  providerErrorCode?: string | null;
}): RSemProbeRepeatResult {
  return {
    repeat: args.repeat,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    executionStatus: args.executionStatus,
    validity: args.validity,
    failureDomain: args.failureDomain,
    failureReason: args.failureReason,
    rawResponse: args.rawResponse,
    modelProvenance: probeModelProvenance(args.response, args.providerErrorCode ?? null),
    booleanCorrect: null,
    booleanTotal: args.booleanTotal,
    booleanAccuracy: null,
    probeDetails: args.probeDetails ?? [],
    actualModel: args.response?.model ?? null,
    usage: args.usage,
    estimatedCostUsd: args.estimatedCostUsd,
  };
}

export async function runRSemRepeat(
  repository: Record<string, string>,
  probes: GeneratedProbe[],
  repeat: number,
  clientFactory: P62ProbeClientFactory = defaultProbeClientFactory
): Promise<RSemProbeRepeatResult> {
  const properties = Object.fromEntries(probes.map((probe) => [probe.probeId, { type: "string" }]));
  const schema = { type: "object", properties, required: probes.map((probe) => probe.probeId), additionalProperties: false };
  const body = buildOpenAIStructuredResponseRequestBody({
    options: {
      model: P6_2_MODEL,
      reasoningEffort: P6_2_REASONING,
      maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      storeResponses: false,
      serviceTier: SERVICE_TIER,
      promptCacheMode: PROMPT_CACHE_MODE,
    },
    responseInput: [{ role: "user", content: probePrompt(repository, probes) }],
    outputSpec: {
      instructions: "Answer semantic probes about the supplied TypeScript repository. Use only supplied repository evidence. If evidence is absent, make the best forced-choice answer rather than claiming hidden knowledge.",
      schemaName: P6_2_PROBE_SCHEMA_VERSION.replace(/-/g, "_"),
      schema,
    },
  });

  const usage = emptyUsage();
  let response: any;
  try {
    const client = clientFactory({ timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    response = await client.responses.create(body as any);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const providerErrorCode = typeof (error as any)?.code === "string" ? (error as any).code : null;
    return probeFailure({
      repeat,
      executionStatus: "provider-error",
      validity: "infrastructure-invalid",
      failureDomain: "infrastructure",
      failureReason: message,
      rawResponse: "",
      response: null,
      usage,
      estimatedCostUsd: null,
      booleanTotal: probes.length,
      providerErrorCode,
    });
  }

  addUsage(usage, response.usage);
  const rawResponse = extractOutputText(response);
  const estimatedCostUsd = estimateOpenAICostUsd(P6_2_MODEL, response.usage, "sync");
  const refusal = extractRefusal(response);
  const failure = responseFailureDetails(response);
  if (refusal) {
    return probeFailure({
      repeat,
      executionStatus: "response-refusal",
      validity: "infrastructure-invalid",
      failureDomain: "infrastructure",
      failureReason: refusal,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
      providerErrorCode: failure.providerErrorCode,
    });
  }
  if (response.status !== "completed") {
    const executionStatus = response.status === "incomplete"
      ? "response-incomplete"
      : response.status === "failed"
        ? "response-failed"
        : "response-not-completed";
    return probeFailure({
      repeat,
      executionStatus,
      validity: "infrastructure-invalid",
      failureDomain: "infrastructure",
      failureReason: failure.incompleteReason ?? failure.providerErrorMessage ?? `response status=${response.status}`,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
      providerErrorCode: failure.providerErrorCode,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawResponse) as Record<string, unknown>;
  } catch (error) {
    return probeFailure({
      repeat,
      executionStatus: "output-parse-failure",
      validity: "valid",
      failureDomain: "protocol",
      failureReason: `Invalid structured JSON: ${error instanceof Error ? error.message : String(error)}`,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
    });
  }

  const answers = Object.fromEntries(probes.map((probe) => [probe.probeId, String(parsed[probe.probeId] ?? "")]));
  let scored: ReturnType<typeof scoreProbes>;
  try {
    scored = scoreProbes(probes, answers);
  } catch (error) {
    return probeFailure({
      repeat,
      executionStatus: "probe-scoring-error",
      validity: "infrastructure-invalid",
      failureDomain: "system",
      failureReason: error instanceof Error ? error.message : String(error),
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
    });
  }
  const details = scored.map((item) => ({
    probeId: item.probeId,
    correct: item.correct,
    agentAnswer: item.agentAnswer,
    correctAnswer: item.correctAnswer,
    parseError: item.parseError,
  }));
  const parseErrors = details.filter((item) => item.parseError);
  if (parseErrors.length > 0) {
    return probeFailure({
      repeat,
      executionStatus: "answer-protocol-failure",
      validity: "valid",
      failureDomain: "protocol",
      failureReason: `Malformed forced-choice answer(s): ${parseErrors.map((item) => item.probeId).join(",")}`,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: scored.length,
      probeDetails: details,
    });
  }

  const correct = scored.filter((item) => item.correct).length;
  return {
    repeat,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    executionStatus: "ok",
    validity: "valid",
    failureDomain: "none",
    failureReason: null,
    rawResponse,
    modelProvenance: probeModelProvenance(response),
    booleanCorrect: correct,
    booleanTotal: scored.length,
    booleanAccuracy: scored.length ? correct / scored.length : 0,
    probeDetails: details,
    actualModel: response.model ?? null,
    usage,
    estimatedCostUsd,
  };
}

function writeResult(resultPath: string, result: P62AfBaselineResult): void {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  const tmp = `${resultPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, resultPath);
}

export function mJournalDirectory(runDir: string): string {
  return path.join(runDir, "m");
}

function probeJournalDirectory(runDir: string, repeat: number): string {
  return path.join(runDir, "rsem", `repeat-${repeat}`);
}

export function commitProbeResultAtomic(runDir: string, result: RSemProbeRepeatResult): void {
  const target = probeJournalDirectory(runDir, result.repeat);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmp, "probe_result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

export function reconcileProbeJournal(
  runDir: string,
  recorded: RSemProbeRepeatResult[]
): { repeatResults: RSemProbeRepeatResult[]; missingArtifactRepeats: number[]; recoveredArtifactRepeats: number[] } {
  const kept: RSemProbeRepeatResult[] = [];
  const missingArtifactRepeats: number[] = [];
  const recoveredArtifactRepeats: number[] = [];
  const seen = new Set<number>();
  for (const item of recorded) {
    const filePath = path.join(probeJournalDirectory(runDir, item.repeat), "probe_result.json");
    if (fs.existsSync(filePath)) {
      kept.push(item);
      seen.add(item.repeat);
    } else {
      missingArtifactRepeats.push(item.repeat);
      fs.rmSync(probeJournalDirectory(runDir, item.repeat), { recursive: true, force: true });
    }
  }
  const rsemDir = path.join(runDir, "rsem");
  if (fs.existsSync(rsemDir)) {
    for (const entry of fs.readdirSync(rsemDir, { withFileTypes: true })) {
      const match = entry.isDirectory() ? /^repeat-(\d+)$/.exec(entry.name) : null;
      if (!match) continue;
      const repeat = Number(match[1]);
      const filePath = path.join(rsemDir, entry.name, "probe_result.json");
      if (!fs.existsSync(filePath)) {
        fs.rmSync(path.join(rsemDir, entry.name), { recursive: true, force: true });
        continue;
      }
      if (seen.has(repeat)) continue;
      try {
        const recovered = JSON.parse(fs.readFileSync(filePath, "utf8")) as RSemProbeRepeatResult;
        if (recovered.repeat !== repeat) throw new Error("repeat mismatch");
        kept.push(recovered);
        seen.add(repeat);
        recoveredArtifactRepeats.push(repeat);
      } catch {
        fs.rmSync(path.join(rsemDir, entry.name), { recursive: true, force: true });
      }
    }
  }
  kept.sort((a, b) => a.repeat - b.repeat);
  return { repeatResults: kept, missingArtifactRepeats, recoveredArtifactRepeats };
}

function parseRepeatCount(argv: string[]): number {
  const token = argv.find((arg) => arg.startsWith("--repeats="));
  if (!token) throw new Error("P6-2 requires explicit --repeats=N; no scientific repeat count is frozen yet");
  return validateP62RepeatCount(Number(token.slice("--repeats=".length)));
}

function parseResumePath(argv: string[]): string | null {
  const index = argv.indexOf("--resume");
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value) throw new Error("--resume requires a P6-2 result.json path");
  return path.resolve(process.cwd(), value);
}

function createResultPath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", "_calibration", `p6-2-af-baseline-luna__${stamp}`, "result.json");
}

function requiresAudit(failureDomain: string): boolean {
  return failureDomain === "infrastructure" || failureDomain === "system";
}

function markNeedsAudit(
  result: P62AfBaselineResult,
  flag: P62AfBaselineResult["auditFlags"][number]
): void {
  result.status = "needs-audit";
  result.auditFlags.push(flag);
  recomputeResult(result);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const repeatCount = parseRepeatCount(argv);
  const live = argv.includes("--live");
  const repoRoot = path.resolve(__dirname, "..");
  assertTrackedWorktreeClean(repoRoot);
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");
  const taskBankPath = path.join(syntheticWorldDir, "heldout_tasks.json");
  const taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const tasks = JSON.parse(taskBankRaw) as HeldOutTask[];
  const selection = selectP62TaskBank(tasks);
  const repository: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repository);
  const taskBankSha256 = hashText(taskBankRaw);
  const baselineRepositorySha256 = hashRepository(repository);
  const probeMaterial = loadProbeMaterial(syntheticWorldDir);
  const manifest = buildP62ExecutionManifest({
    repoRoot,
    repeatCount,
    taskBankSha256,
    baselineRepositorySha256,
    probeMaterial,
  });
  const resumePath = parseResumePath(argv);

  console.log("P6-2 FROZEN MANIFEST", JSON.stringify(manifest));
  console.log("P6-2 M TASKS", JSON.stringify({
    primary: selection.primary.map((task) => task.taskId),
    diagnostic: selection.diagnostic.map((task) => task.taskId),
    excludedSemanticFloor: [...P6_2_SEMANTIC_FLOOR_TASK_IDS],
  }));
  console.log("P6-2 RSEM", JSON.stringify({ designVersion: STAGE1_BOOLEAN_DESIGN_VERSION, booleanProbes: probeMaterial.booleanProbes.length }));
  console.log("P6-2 REPEATS", repeatCount);

  if (!live) {
    console.log("STOP: dry/offline mode. Add --live only after Delta_M/Delta_R and scientific repeat count are frozen.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for P6-2 live execution");

  const resultPath = resumePath ?? createResultPath(repoRoot);
  const runDir = path.dirname(resultPath);
  let result: P62AfBaselineResult;
  if (resumePath) {
    result = JSON.parse(fs.readFileSync(resumePath, "utf8")) as P62AfBaselineResult;
    assertP62ResumeCompatible(result, manifest, taskBankRaw, repository);
    if (result.status === "needs-audit") {
      throw new Error("Resume refused: P6-2 result is needs-audit; inspect the recorded auditFlags before continuation");
    }
    const mRecovery = reconcileRepeatJournal(mJournalDirectory(runDir), result.measurements.M.repeatResults);
    result.measurements.M.repeatResults = mRecovery.repeatResults as ClassifiedMRepeatResult[];
    const rRecovery = reconcileProbeJournal(runDir, result.measurements.Rsem.repeatResults);
    result.measurements.Rsem.repeatResults = rRecovery.repeatResults;
    if (mRecovery.missingArtifactKeys.length || mRecovery.recoveredArtifactKeys.length ||
        rRecovery.missingArtifactRepeats.length || rRecovery.recoveredArtifactRepeats.length) {
      console.log("P6-2 JOURNAL RECOVERY", JSON.stringify({ M: mRecovery, Rsem: rRecovery }));
    }
    recomputeResult(result);
    writeResult(resultPath, result);
  } else {
    result = createP62Result({
      taskBankPath,
      taskBankRaw,
      tasks,
      repositoryPath: repositoryDir,
      repository,
      repeatCount,
      manifest,
      booleanProbeIds: probeMaterial.booleanProbes.map((probe) => probe.probeId),
    });
    writeResult(resultPath, result);
    console.log("RESULT", resultPath);
  }

  const taskById = new Map(selection.measured.map((task) => [task.taskId, task]));
  const mPlan = planP62MRepeats(selection, repeatCount, result.measurements.M.repeatResults);
  for (const planned of mPlan) {
    const task = taskById.get(planned.taskId);
    if (!task) throw new Error(`P6-2 planned task missing: ${planned.taskId}`);
    const execution = await runMRepeat(repository, syntheticWorldDir, task, planned.role, planned.repeat);
    const classified = classifyP62MRepeat(execution.result, planned.role) as ClassifiedMRepeatResult;
    commitRepeatArtifactsAtomic(mJournalDirectory(runDir), classified, execution.artifacts);
    result.measurements.M.repeatResults.push(classified);
    recomputeResult(result);
    writeResult(resultPath, result);
    console.log(`P6-2 M ${classified.taskId} repeat=${classified.repeat} role=${classified.role} passed=${classified.passed} domain=${classified.failureDomain}`);
    if (requiresAudit(classified.failureDomain)) {
      markNeedsAudit(result, {
        measurement: "M",
        taskId: classified.taskId,
        repeat: classified.repeat,
        failureDomain: classified.failureDomain,
        executionStatus: classified.executionStatus,
        reason: classified.failureReason,
      });
      writeResult(resultPath, result);
      console.log("STOP: P6-2 entered needs-audit after structural/infrastructure M failure; no further repeats executed.");
      return;
    }
  }

  const rPlan = planP62ProbeRepeats(repeatCount, result.measurements.Rsem.repeatResults);
  for (const repeat of rPlan) {
    const probeResult = await runRSemRepeat(repository, probeMaterial.booleanProbes, repeat);
    commitProbeResultAtomic(runDir, probeResult);
    result.measurements.Rsem.repeatResults.push(probeResult);
    recomputeResult(result);
    writeResult(resultPath, result);
    console.log(`P6-2 Rsem repeat=${repeat} status=${probeResult.executionStatus} domain=${probeResult.failureDomain} accuracy=${probeResult.booleanAccuracy === null ? "null" : probeResult.booleanAccuracy.toFixed(3)}`);
    if (requiresAudit(probeResult.failureDomain)) {
      markNeedsAudit(result, {
        measurement: "Rsem",
        taskId: null,
        repeat: probeResult.repeat,
        failureDomain: probeResult.failureDomain,
        executionStatus: probeResult.executionStatus,
        reason: probeResult.failureReason,
      });
      writeResult(resultPath, result);
      console.log("STOP: P6-2 entered needs-audit after structural/infrastructure Rsem failure; no further repeats executed.");
      return;
    }
  }

  result.status = "completed";
  result.completedAt = new Date().toISOString();
  result.updatedAt = result.completedAt;
  recomputeResult(result);
  writeResult(resultPath, result);
  console.log("P6-2 M SUMMARY", JSON.stringify(result.measurements.M.summary));
  console.log("P6-2 RSEM SUMMARY", JSON.stringify({ meanBooleanAccuracy: result.measurements.Rsem.meanBooleanAccuracy }));
  console.log(`P6-2 TOTAL COST $${result.estimatedCostUsd.toFixed(6)}`);
  console.log("RESULT", resultPath);
  console.log("STOP: P6-3 and later phases were not executed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("p6-af-baseline failed:", error);
    process.exit(1);
  });
}
