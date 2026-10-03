import OpenAI from "openai";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import {
  type P62ProbeClient,
  type P62ProbeClientFactory,
  type RSemProbeRepeatResult,
} from "../../p6-af-baseline-live";
import type { FixedEnvironmentBinding } from "../context/fixed-environment-runtime";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./p6-3-live-calibration-runner";
import {
  executeP63V3RSemCell,
  P6_3_V3_RSEM_EXECUTOR_VERSION,
} from "./p6-3-v3-rsem-executor";
import {
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
} from "./p6-3-v3-rsem-completion-predeclaration";

export const P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION =
  "p6-3-v3-rsem-completion-executor-v1" as const;

const defaultProbeClientFactory: P62ProbeClientFactory = (options) =>
  new OpenAI(options) as P62ProbeClient;

export function createP63V3RSemCompletionClientFactory(
  baseFactory: P62ProbeClientFactory = defaultProbeClientFactory
): P62ProbeClientFactory {
  return (options) => {
    if (
      options.timeout !==
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.requestTimeoutMs
    ) {
      throw new Error("P6-3 v3 Rsem completion timeout drifted");
    }
    if (
      options.maxRetries !==
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries
    ) {
      throw new Error("P6-3 v3 Rsem completion SDK retry contract drifted");
    }
    const client = baseFactory(options);
    return {
      responses: {
        create: async (body: any) => {
          if (
            body.model !== P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.model ||
            body.reasoning?.effort !==
              P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.reasoningEffort
          ) {
            throw new Error(
              "P6-3 v3 Rsem completion model/reasoning contract drifted"
            );
          }
          if (body.max_output_tokens !== 8000) {
            throw new Error(
              "P6-3 v3 Rsem completion expected the frozen historical 8000-token request before the predeclared reliability amendment"
            );
          }
          const amended = {
            ...body,
            max_output_tokens:
              P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
          };
          return client.responses.create(amended);
        },
      },
    };
  };
}

export async function executeP63V3RSemCompletionCell(
  args: {
    contextFiles: Record<string, string>;
    probes: GeneratedProbe[];
    repeat: number;
    exposure: P63ExposureEvidence;
    fixedEnvironment: Readonly<FixedEnvironmentBinding>;
  },
  baseClientFactory: P62ProbeClientFactory = defaultProbeClientFactory
): Promise<P63CellOutcome> {
  const baseOutcome = await executeP63V3RSemCell(
    args,
    createP63V3RSemCompletionClientFactory(baseClientFactory)
  );
  const artifact = requireArtifact(baseOutcome.artifactPayload);
  const result = requireRSemResult(artifact.result);
  const normalizedResult: RSemProbeRepeatResult = {
    ...result,
    modelProvenance: {
      ...result.modelProvenance,
      maxOutputTokens:
        P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
      requestTimeoutMs:
        P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.requestTimeoutMs,
      maxRetries:
        P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
    },
  };

  return {
    ...baseOutcome,
    diagnosticSummary: {
      ...baseOutcome.diagnosticSummary,
      validity: normalizedResult.validity,
      completionExecutorVersion:
        P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
      completionPredeclarationVersion:
        P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
      providerMaxOutputTokens:
        P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
      providerMaxRetries:
        P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
    },
    artifactPayload: {
      ...artifact,
      executorVersion: P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
      baseExecutorVersion: P6_3_V3_RSEM_EXECUTOR_VERSION,
      completionPredeclarationVersion:
        P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
      providerContract: {
        ...P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
      },
      result: normalizedResult,
    },
  };
}

function requireArtifact(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object") {
    throw new Error(
      "P6-3 v3 Rsem completion base executor returned no artifact payload"
    );
  }
  return value as Record<string, any>;
}

function requireRSemResult(value: unknown): RSemProbeRepeatResult {
  if (!value || typeof value !== "object") {
    throw new Error(
      "P6-3 v3 Rsem completion base executor returned no scientific result"
    );
  }
  const result = value as RSemProbeRepeatResult;
  if (
    result.validity !== "valid" &&
    result.validity !== "infrastructure-invalid"
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion scientific validity is malformed"
    );
  }
  return result;
}
