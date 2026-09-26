import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import { OpenAIBackend } from "../agent-backend/openai";
import type { AgentResult } from "../agent-backend/types";
import { isCensoredAgentExecutionStatus } from "../run-validity";
import { runScoring } from "../scoring";
import type { TestSuiteResult } from "../types";
import { classifyP62MRepeat } from "./af-baseline";
import {
  P6_3_MUTATION_PROVIDER_CONTRACT,
  validateP63MutationPathsP62Compatible,
} from "./p6-3-mutation-protocol-parity";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./p6-3-live-calibration-runner";
import {
  runRSemRepeat,
  type RSemProbeRepeatResult,
} from "../../p6-af-baseline-live";

export interface P63MutationTask {
  taskId: string;
  type?: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

interface P63MRawResult {
  taskId: string;
  taskType: string | null;
  repeat: number;
  passed: boolean;
  validity: "valid" | "infrastructure-invalid";
  failureCategory: string | null;
  failureReason: string | null;
  executionStatus: string;
  protocolContractViolated: boolean | null;
  modifiedPaths: string[];
  workingNote: string | null;
  actualModel: string | null;
  usage: unknown;
  estimatedCostUsd: number | null;
  visible: ReturnType<typeof suiteDigest> | null;
  hidden: ReturnType<typeof suiteDigest> | null;
  taskSpecific: ReturnType<typeof suiteDigest> | null;
}

export async function executeP63MCell(args: {
  contextFiles: Record<string, string>;
  evaluationRepository: Record<string, string>;
  syntheticWorldDir: string;
  task: P63MutationTask;
  repeat: number;
  contextBudget: number | "full";
  exposure: P63ExposureEvidence;
}): Promise<P63CellOutcome> {
  const backend = new OpenAIBackend({
    model: P6_3_MUTATION_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_MUTATION_PROVIDER_CONTRACT.reasoningEffort,
    maxOutputTokens: P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
    requestTimeoutMs: P6_3_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs,
    maxRetries: P6_3_MUTATION_PROVIDER_CONTRACT.providerMaxRetries,
    storeResponses: P6_3_MUTATION_PROVIDER_CONTRACT.storeResponses,
    maxToolRounds: P6_3_MUTATION_PROVIDER_CONTRACT.maxToolRounds,
    serviceTier: P6_3_MUTATION_PROVIDER_CONTRACT.serviceTier,
    promptCacheMode: P6_3_MUTATION_PROVIDER_CONTRACT.promptCacheMode,
  });

  const agent = await backend.run({
    contextFiles: { ...args.contextFiles },
    visibleInstruction: args.task.visibleInstruction,
    contextBudget: args.contextBudget,
  });
  const modifiedPaths = Object.keys(agent.modifiedFiles ?? {}).sort();
  const base = {
    taskId: args.task.taskId,
    taskType: args.task.type ?? null,
    repeat: args.repeat,
    modifiedPaths,
    workingNote: agent.explicitWorkingNote,
    actualModel: agent.modelProvenance.actualModel,
    usage: agent.tokenUsage ?? null,
    estimatedCostUsd: agent.estimatedCostUsd ?? null,
  };

  if (agent.executionStatus !== "ok") {
    const invalid =
      isCensoredAgentExecutionStatus(agent.executionStatus) ||
      agent.error?.category === "provider";
    return finalizeMOutcome(
      {
        ...base,
        passed: false,
        validity: invalid ? "infrastructure-invalid" : "valid",
        failureCategory: agent.error?.category ?? agent.executionStatus,
        failureReason: agent.error?.message ?? agent.executionStatus,
        executionStatus: agent.executionStatus,
        protocolContractViolated: null,
        visible: null,
        hidden: null,
        taskSpecific: null,
      },
      agent,
      args.exposure
    );
  }

  const pathError = validateP63MutationPathsP62Compatible(agent.modifiedFiles);
  if (pathError) {
    return finalizeMOutcome(
      {
        ...base,
        passed: false,
        validity: "valid",
        failureCategory: "mutation-validation",
        failureReason: pathError,
        executionStatus: "mutation-validation-failure",
        protocolContractViolated: null,
        visible: null,
        hidden: null,
        taskSpecific: null,
      },
      agent,
      args.exposure
    );
  }

  const merged = { ...args.evaluationRepository, ...agent.modifiedFiles };
  try {
    const scoring = await runScoring(
      merged,
      args.syntheticWorldDir,
      args.task.taskSpecificTestCode
    );
    const visible = suiteDigest(scoring.visibleTests);
    const hidden = suiteDigest(scoring.hiddenTests);
    const taskSpecific = scoring.taskSpecificTests
      ? suiteDigest(scoring.taskSpecificTests)
      : null;
    const passed =
      scoring.visibleTests.passed &&
      scoring.hiddenTests.passed &&
      (scoring.taskSpecificTests?.passed ?? true) &&
      !scoring.protocolContractViolated;
    return finalizeMOutcome(
      {
        ...base,
        passed,
        validity: "valid",
        failureCategory: passed
          ? null
          : scoring.protocolContractViolated
            ? "protocol-contract"
            : "test-failure",
        failureReason: passed
          ? null
          : failureReasonFromSuites(
              scoring.visibleTests,
              scoring.hiddenTests,
              scoring.taskSpecificTests
            ),
        executionStatus: agent.executionStatus,
        protocolContractViolated: scoring.protocolContractViolated,
        visible,
        hidden,
        taskSpecific,
      },
      agent,
      args.exposure
    );
  } catch (error) {
    const runnerError = error instanceof Error
      ? error.stack ?? error.message
      : String(error);
    return finalizeMOutcome(
      {
        ...base,
        passed: false,
        validity: "infrastructure-invalid",
        failureCategory: "harness",
        failureReason: runnerError,
        executionStatus: agent.executionStatus,
        protocolContractViolated: null,
        visible: null,
        hidden: null,
        taskSpecific: null,
      },
      agent,
      args.exposure,
      runnerError
    );
  }
}

export async function executeP63RSemCell(args: {
  contextFiles: Record<string, string>;
  probes: GeneratedProbe[];
  repeat: number;
  exposure: P63ExposureEvidence;
}): Promise<P63CellOutcome> {
  // Reuse the exact P6-2 historical runner function. The P6-3 Rsem parity
  // freeze fingerprints that source and proves that contextFiles is the sole
  // arm-dependent repository-evidence input.
  const result: RSemProbeRepeatResult = await runRSemRepeat(
    { ...args.contextFiles },
    args.probes,
    args.repeat
  );
  return {
    failureDomain: result.failureDomain,
    executionStatus: result.executionStatus,
    passed: null,
    semanticScore: result.booleanAccuracy,
    protocolValid: result.protocolValid,
    estimatedCostUsd: result.estimatedCostUsd,
    failureReason: result.failureReason,
    exposure: args.exposure,
    diagnosticSummary: {
      booleanCorrect: result.booleanCorrect,
      booleanTotal: result.booleanTotal,
      booleanAccuracy: result.booleanAccuracy,
      protocolValid: result.protocolValid,
      failureDomain: result.failureDomain,
      rawFailureDomain: result.rawFailureDomain,
    },
    artifactPayload: result,
  };
}

function finalizeMOutcome(
  raw: P63MRawResult,
  agent: AgentResult,
  exposure: P63ExposureEvidence,
  runnerError: string | null = null
): P63CellOutcome {
  const classified = classifyP62MRepeat(raw, "primary");
  return {
    failureDomain: classified.failureDomain,
    executionStatus: classified.executionStatus,
    passed: classified.passed,
    semanticScore: classified.passed ? 1 : 0,
    protocolValid:
      classified.failureDomain === "protocol"
        ? false
        : classified.failureDomain === "infrastructure"
          ? null
          : true,
    estimatedCostUsd: classified.estimatedCostUsd,
    failureReason: classified.failureReason,
    exposure,
    diagnosticSummary: {
      failureDomain: classified.failureDomain,
      rawFailureDomain: classified.rawFailureDomain,
      failureCategory: classified.failureCategory,
      protocolContractViolated: classified.protocolContractViolated,
      modifiedPaths: classified.modifiedPaths,
      visiblePassed: classified.visible?.passed ?? null,
      hiddenPassed: classified.hidden?.passed ?? null,
      taskSpecificPassed: classified.taskSpecific?.passed ?? null,
    },
    artifactPayload: {
      result: classified,
      agent: {
        rawResponse: agent.rawResponse,
        modifiedFiles: agent.modifiedFiles,
        explicitWorkingNote: agent.explicitWorkingNote,
        modelProvenance: agent.modelProvenance,
        tokenUsage: agent.tokenUsage ?? null,
        estimatedCostUsd: agent.estimatedCostUsd,
        executionStatus: agent.executionStatus,
        error: agent.error,
      },
      runnerError,
    },
  };
}

function suiteDigest(suite: TestSuiteResult) {
  return {
    passed: suite.passed,
    numPassed: suite.numPassed,
    numFailed: suite.numFailed,
    executionError: suite.executionError ?? null,
    failedCases: suite.testCases
      .filter((item) => !item.passed)
      .map((item) => ({
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
  for (const [name, suite] of [
    ["visible", visible],
    ["hidden", hidden],
    ["task-specific", taskSpecific],
  ] as const) {
    if (!suite) continue;
    if (suite.executionError) parts.push(`${name}:execution:${suite.executionError}`);
    for (const test of suite.testCases.filter((item) => !item.passed)) {
      parts.push(`${name}:${test.testName}${test.error ? `:${test.error}` : ""}`);
    }
  }
  return parts.length ? parts.join(" | ") : null;
}
