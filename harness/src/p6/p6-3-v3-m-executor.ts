import { OpenAIV3FixedEnvironmentBackend } from "../agent-backend/openai/v3-fixed-environment";
import type { AgentResult } from "../agent-backend/types";
import {
  assertFixedEnvironmentBinding,
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  type FixedEnvironmentBinding,
} from "../context/fixed-environment-runtime";
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

export const P6_3_V3_M_EXECUTOR_VERSION = "p6-3-v3-m-executor-v1" as const;

export interface P63V3MutationTask {
  taskId: string;
  type?: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

interface P63V3MRawResult {
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

/**
 * P6-3 v3-only M executor.
 *
 * The caller must provide the already-built run-fixed E_fixed binding. This
 * executor deliberately never calls buildGenerationZeroFixedEnvironment() or
 * createFixedEnvironmentBinding(); it validates and forwards the exact binding
 * unchanged to OpenAIV3FixedEnvironmentBackend.
 *
 * `contextBudget` and `exposure` remain artifact-only accounting. E_fixed
 * tokens are diagnostic/provider-input accounting and MUST NOT be added to
 * B_expose/B_work.
 */
export async function executeP63V3MCell(args: {
  contextFiles: Record<string, string>;
  evaluationRepository: Record<string, string>;
  syntheticWorldDir: string;
  task: P63V3MutationTask;
  repeat: number;
  contextBudget: number | "full";
  exposure: P63ExposureEvidence;
  fixedEnvironment: Readonly<FixedEnvironmentBinding>;
}): Promise<P63CellOutcome> {
  assertFixedEnvironmentBinding(args.fixedEnvironment);

  const backend = new OpenAIV3FixedEnvironmentBackend({
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
    fixedEnvironment: args.fixedEnvironment,
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
    return finalizeP63V3MOutcome(
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
      args.exposure,
      args.fixedEnvironment
    );
  }

  const pathError = validateP63MutationPathsP62Compatible(agent.modifiedFiles);
  if (pathError) {
    return finalizeP63V3MOutcome(
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
      args.exposure,
      args.fixedEnvironment
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
    return finalizeP63V3MOutcome(
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
      args.exposure,
      args.fixedEnvironment
    );
  } catch (error) {
    const runnerError = error instanceof Error
      ? error.stack ?? error.message
      : String(error);
    return finalizeP63V3MOutcome(
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
      args.fixedEnvironment,
      runnerError
    );
  }
}

function finalizeP63V3MOutcome(
  raw: P63V3MRawResult,
  agent: AgentResult,
  exposure: P63ExposureEvidence,
  fixedEnvironment: Readonly<FixedEnvironmentBinding>,
  runnerError: string | null = null
): P63CellOutcome {
  const classified = classifyP62MRepeat(raw, "primary");
  const environmentIdentity = fixedEnvironmentIdentity(fixedEnvironment);
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
      fixedEnvironmentIdentity: environmentIdentity,
      fixedEnvironmentModelVisibleTokens: fixedEnvironment.modelVisibleTokens,
    },
    artifactPayload: {
      executorVersion: P6_3_V3_M_EXECUTOR_VERSION,
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
      fixedEnvironment: fixedEnvironmentLogSnapshot(fixedEnvironment),
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
