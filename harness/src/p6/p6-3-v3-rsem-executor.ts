import { createHash } from "crypto";
import OpenAI from "openai";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import {
  runRSemRepeat,
  type P62ProbeClient,
  type P62ProbeClientFactory,
  type RSemProbeRepeatResult,
} from "../../p6-af-baseline-live";
import {
  assertFixedEnvironmentBinding,
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  serializeFixedEnvironmentForModel,
  type FixedEnvironmentBinding,
} from "../context/fixed-environment-runtime";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./p6-3-live-calibration-runner";

export const P6_3_V3_RSEM_EXECUTOR_VERSION = "p6-3-v3-rsem-executor-v1" as const;
export const P6_3_V3_RSEM_PROMPT_VERSION = "p6-3-v3-rsem-fixed-environment-v1" as const;
export const P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS =
  "Answer semantic probes about the supplied TypeScript repository using the supplied fixed environment specification as common environment/interface evidence. Use only supplied fixed-environment and repository evidence. If evidence is absent, make the best forced-choice answer rather than claiming hidden knowledge." as const;
export const P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256 = sha256(
  P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS
);

const defaultProbeClientFactory: P62ProbeClientFactory = (options) =>
  new OpenAI(options) as P62ProbeClient;

/**
 * Convert the exact historical P6-2 Rsem request envelope into the v3 request
 * envelope by adding E_fixed as a separate model-visible section and updating
 * only the evidence-scope instruction that must acknowledge that new channel.
 *
 * Model, reasoning effort, output schema, max output, cache/service settings,
 * repository/probe prompt, parser, scorer, and failure semantics remain owned
 * by historical runRSemRepeat().
 */
export function buildP63V3RSemRequestBody(
  historicalBody: Readonly<Record<string, unknown>>,
  fixedEnvironment: Readonly<FixedEnvironmentBinding>
): Record<string, unknown> {
  assertFixedEnvironmentBinding(fixedEnvironment);
  const input = historicalBody.input;
  if (!Array.isArray(input)) {
    throw new Error("P6-3 v3 Rsem requires historical Responses input array");
  }

  let transformedUserMessages = 0;
  const transformedInput = input.map((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      (entry as { role?: unknown }).role === "user" &&
      typeof (entry as { content?: unknown }).content === "string"
    ) {
      const content = (entry as { content: string }).content;
      if (!content.startsWith("REPOSITORY FILES:")) return entry;
      transformedUserMessages += 1;
      return {
        ...(entry as Record<string, unknown>),
        content: `${serializeFixedEnvironmentForModel(fixedEnvironment)}\n\n${content}`,
      };
    }
    return entry;
  });

  if (transformedUserMessages !== 1) {
    throw new Error(
      `P6-3 v3 Rsem expected exactly one historical repository probe message, found ${transformedUserMessages}`
    );
  }

  return {
    ...historicalBody,
    instructions: P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS,
    input: transformedInput,
  };
}

/**
 * Wrap a historical P62ProbeClientFactory so runRSemRepeat() remains the sole
 * owner of provider settings, schema, parsing/scoring, and failure semantics.
 * Only the final model-visible request is transformed to add E_fixed.
 */
export function createP63V3RSemClientFactory(
  fixedEnvironment: Readonly<FixedEnvironmentBinding>,
  baseFactory: P62ProbeClientFactory = defaultProbeClientFactory
): P62ProbeClientFactory {
  assertFixedEnvironmentBinding(fixedEnvironment);
  return (options) => {
    const baseClient = baseFactory(options);
    return {
      responses: {
        create: (body: any) =>
          baseClient.responses.create(
            buildP63V3RSemRequestBody(body, fixedEnvironment) as any
          ),
      },
    };
  };
}

/**
 * P6-3 v3-only Rsem executor.
 *
 * The caller supplies one already-built run-fixed FixedEnvironmentBinding.
 * This function never constructs E_fixed. It delegates the full historical
 * Rsem scientific path to runRSemRepeat() and injects E_fixed only through the
 * historical runner's existing clientFactory seam.
 */
export async function executeP63V3RSemCell(
  args: {
    contextFiles: Record<string, string>;
    probes: GeneratedProbe[];
    repeat: number;
    exposure: P63ExposureEvidence;
    fixedEnvironment: Readonly<FixedEnvironmentBinding>;
  },
  baseClientFactory: P62ProbeClientFactory = defaultProbeClientFactory
): Promise<P63CellOutcome> {
  assertFixedEnvironmentBinding(args.fixedEnvironment);
  const result: RSemProbeRepeatResult = await runRSemRepeat(
    { ...args.contextFiles },
    args.probes,
    args.repeat,
    createP63V3RSemClientFactory(args.fixedEnvironment, baseClientFactory)
  );
  const environmentIdentity = fixedEnvironmentIdentity(args.fixedEnvironment);

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
      fixedEnvironmentIdentity: environmentIdentity,
      fixedEnvironmentModelVisibleTokens: args.fixedEnvironment.modelVisibleTokens,
    },
    artifactPayload: {
      executorVersion: P6_3_V3_RSEM_EXECUTOR_VERSION,
      promptVersion: P6_3_V3_RSEM_PROMPT_VERSION,
      outputInstructionsSha256: P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256,
      fixedEnvironment: fixedEnvironmentLogSnapshot(args.fixedEnvironment),
      result,
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
