import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import { OpenAIBackend, type OpenAIBackendOptions } from "../agent-backend/openai";
import type { AgentBackend, AgentResult } from "../agent-backend/types";
import { isCensoredAgentExecutionStatus } from "../run-validity";
import { runScoring } from "../scoring";
import type { TestSuiteResult } from "../types";
import { classifyP62MRepeat } from "./af-baseline";
import { validateP63MutationPathsP62Compatible } from "./p6-3-mutation-protocol-parity";
import type { P63ExposureEvidence } from "./p6-3-live-calibration-runner";
import type { P63MutationTask } from "./p6-3-live-executors";
import {
  P6_3_V2_MUTATION_PROVIDER_CONTRACT,
  P6_3_V2_RSEM_PROVIDER_CONTRACT,
} from "./p6-3-v2-execution-parameters";
import type { P63V2AutoInfraEvidence } from "./p6-3-v2-auto-infra";
import type { P63V2ReliabilityCellOutcome } from "./p6-3-v2-secondary-reliability";
import {
  runRSemRepeat,
  type RSemProbeRepeatResult,
} from "../../p6-af-baseline-live";

interface P63V2MRawResult {
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

export type P63V2MutationBackendFactory = (
  options: OpenAIBackendOptions
) => AgentBackend;

export type P63V2RSemRunner = (
  repository: Record<string, string>,
  probes: GeneratedProbe[],
  repeat: number
) => Promise<RSemProbeRepeatResult>;

const defaultMutationBackendFactory: P63V2MutationBackendFactory =
  (options) => new OpenAIBackend(options);
const defaultRSemRunner: P63V2RSemRunner =
  (repository, probes, repeat) => runRSemRepeat(repository, probes, repeat);

/**
 * V2 mutation adapter. Measurement semantics mirror the frozen P6-2-compatible
 * P6-3 adapter, while the separately frozen v2 provider envelope is used here.
 */
export async function executeP63V2MCell(args: {
  contextFiles: Record<string, string>;
  evaluationRepository: Record<string, string>;
  syntheticWorldDir: string;
  task: P63MutationTask;
  repeat: number;
  contextBudget: number | "full";
  exposure: P63ExposureEvidence;
  backendFactory?: P63V2MutationBackendFactory;
}): Promise<P63V2ReliabilityCellOutcome> {
  const backendFactory = args.backendFactory ?? defaultMutationBackendFactory;
  const backend = backendFactory({
    model: P6_3_V2_MUTATION_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_V2_MUTATION_PROVIDER_CONTRACT.reasoningEffort,
    maxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
    requestTimeoutMs: P6_3_V2_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs,
    maxRetries: P6_3_V2_MUTATION_PROVIDER_CONTRACT.providerMaxRetries,
    storeResponses: P6_3_V2_MUTATION_PROVIDER_CONTRACT.storeResponses,
    maxToolRounds: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxToolRounds,
    serviceTier: P6_3_V2_MUTATION_PROVIDER_CONTRACT.serviceTier,
    promptCacheMode: P6_3_V2_MUTATION_PROVIDER_CONTRACT.promptCacheMode,
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

/**
 * V2 Rsem adapter keeps the frozen P6-2/P6-3 protocol implementation and
 * 8000-token provider envelope and exposes only v2 reliability telemetry.
 */
export async function executeP63V2RSemCell(args: {
  contextFiles: Record<string, string>;
  probes: GeneratedProbe[];
  repeat: number;
  exposure: P63ExposureEvidence;
  rsemRunner?: P63V2RSemRunner;
}): Promise<P63V2ReliabilityCellOutcome> {
  const runner = args.rsemRunner ?? defaultRSemRunner;
  const result = await runner(
    { ...args.contextFiles },
    args.probes,
    args.repeat
  );
  const incompleteReason = deriveRSemIncompleteReason(result);
  const hasProviderResponse = result.modelProvenance.responseId !== null;
  const usage = hasProviderResponse ? result.usage : null;
  const infrastructureEvidence: P63V2AutoInfraEvidence | null =
    result.failureDomain === "infrastructure"
      ? {
          executionStatus: result.executionStatus,
          incompleteReason,
          outputTokens: usage?.output ?? null,
          configuredMaxOutputTokens: P6_3_V2_RSEM_PROVIDER_CONTRACT.maxOutputTokens,
          responseStatus: result.modelProvenance.responseStatus,
          providerErrorCode: result.modelProvenance.providerErrorCode,
          errorCategory: result.executionStatus.startsWith("response-") ? "response" : null,
        }
      : null;

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
    autoInfrastructureEvidence: infrastructureEvidence,
    reliabilityTelemetry: {
      tokenUsage: {
        input: usage?.input ?? null,
        output: usage?.output ?? null,
        reasoningOutput: usage?.reasoningOutput ?? null,
        total: usage?.total ?? null,
      },
      configuredMaxOutputTokens: P6_3_V2_RSEM_PROVIDER_CONTRACT.maxOutputTokens,
      incompleteReason,
    },
  };
}

function finalizeMOutcome(
  raw: P63V2MRawResult,
  agent: AgentResult,
  exposure: P63ExposureEvidence,
  runnerError: string | null = null
): P63V2ReliabilityCellOutcome {
  const classified = classifyP62MRepeat(raw, "primary");
  const incompleteReason = agent.modelProvenance.incompleteReason ?? null;
  const hasProviderResponse = agent.modelProvenance.responseId !== null;
  const usage = hasProviderResponse ? agent.tokenUsage ?? null : null;
  const infrastructureEvidence: P63V2AutoInfraEvidence | null =
    classified.failureDomain === "infrastructure"
      ? {
          executionStatus: classified.executionStatus,
          incompleteReason,
          outputTokens: usage?.output ?? null,
          configuredMaxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
          responseStatus: agent.modelProvenance.responseStatus,
          providerErrorCode: agent.modelProvenance.providerErrorCode,
          errorCategory: agent.error?.category ?? null,
        }
      : null;

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
    autoInfrastructureEvidence: infrastructureEvidence,
    reliabilityTelemetry: {
      tokenUsage: {
        input: usage?.input ?? null,
        output: usage?.output ?? null,
        reasoningOutput: usage?.reasoningOutput ?? null,
        total: usage?.total ?? null,
      },
      configuredMaxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
      incompleteReason,
    },
  };
}

/** Historical Rsem result exposes incomplete reason only through failureReason. */
function deriveRSemIncompleteReason(result: RSemProbeRepeatResult): string | null {
  if (result.executionStatus !== "response-incomplete") return null;
  return result.failureReason === "max_output_tokens" ? "max_output_tokens" : null;
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
