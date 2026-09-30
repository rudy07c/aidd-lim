import assert from "assert";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import {
  loadProbeMaterial,
  type P62ProbeClientFactory,
} from "./p6-af-baseline-live";
import {
  buildGenerationZeroFixedEnvironment,
} from "./src/context/generation-zero-fixed-environment";
import {
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  serializeFixedEnvironmentForModel,
} from "./src/context/fixed-environment-runtime";
import {
  buildP63RSemPromptP62Compatible,
  buildP63RSemSchemaP62Compatible,
  P6_3_RSEM_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-rsem-protocol-parity";
import {
  executeP63V3RSemCell,
  P6_3_V3_RSEM_EXECUTOR_VERSION,
  P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS,
  P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256,
  P6_3_V3_RSEM_PROMPT_VERSION,
} from "./src/p6/p6-3-v3-rsem-executor";
import type { P63ExposureEvidence } from "./src/p6/p6-3-live-calibration-runner";

const historicalExecutorSource = fs.readFileSync(
  path.join(__dirname, "src", "p6", "p6-3-live-executors.ts"),
  "utf8"
);
const v3Source = fs.readFileSync(
  path.join(__dirname, "src", "p6", "p6-3-v3-rsem-executor.ts"),
  "utf8"
);
const historicalExecutableSource = stripComments(historicalExecutorSource);
const v3ExecutableSource = stripComments(v3Source);

// 1. PR C is additive. Historical executeP63RSemCell remains the sole Rsem
//    function in the historical file and is not rewired to the v3 executor.
assert.ok(historicalExecutableSource.includes("export async function executeP63RSemCell"));
assert.ok(!historicalExecutableSource.includes("executeP63V3RSemCell"));
assert.ok(!historicalExecutableSource.includes("p6-3-v3-rsem-executor"));

// 2. The v3 executor consumes but never constructs E_fixed.
assert.equal(P6_3_V3_RSEM_EXECUTOR_VERSION, "p6-3-v3-rsem-executor-v1");
assert.equal(P6_3_V3_RSEM_PROMPT_VERSION, "p6-3-v3-rsem-fixed-environment-v1");
assert.ok(v3ExecutableSource.includes("export async function executeP63V3RSemCell"));
assert.ok(!v3ExecutableSource.includes("generation-zero-fixed-environment"));
assert.ok(!v3ExecutableSource.includes("buildGenerationZeroFixedEnvironment"));
assert.ok(!v3ExecutableSource.includes("createFixedEnvironmentBinding"));
assert.ok(v3ExecutableSource.includes("assertFixedEnvironmentBinding(args.fixedEnvironment)"));

// 3. Scientific Rsem semantics remain delegated to historical runRSemRepeat;
//    PR C does not import/duplicate scoreProbes or a v3 parser.
assert.ok(v3ExecutableSource.includes("runRSemRepeat("));
assert.ok(!v3ExecutableSource.includes("scoreProbes"));
assert.ok(!v3ExecutableSource.includes("parseP63RSemCompletedResponseP62Compatible"));

const repoRoot = path.resolve(__dirname, "..");
const probes = loadProbeMaterial(path.join(repoRoot, "synthetic-world")).booleanProbes;
assert.equal(probes.length, 12);
const contextFiles = {
  "src/a.ts": "export const a = 1;\n",
  "tests/a.visible.test.ts": "export const expected = true;\n",
};
const fixedEnvironment = buildGenerationZeroFixedEnvironment({
  repositoryFiles: contextFiles,
});
const exposure: P63ExposureEvidence = {
  mode: "EL-static",
  budgetTokens: 123,
  actualExposedTokens: 37,
  fullRepositoryTokens: 999,
  staticPayloadHash: "fixture-static-payload",
  exposureSetHash: "fixture-exposure-set",
  selectorPlanHash: "fixture-selector-plan",
  selectedUnitCount: 2,
};

let capturedOptions: { timeout: number; maxRetries: number } | null = null;
let capturedBody: any = null;
const fakeFactory: P62ProbeClientFactory = (options) => {
  capturedOptions = options;
  return {
    responses: {
      create: async (body: any) => {
        capturedBody = body;
        return successfulProbeResponse(probes);
      },
    },
  };
};

async function main(): Promise<void> {
  const outcome = await executeP63V3RSemCell(
    {
      contextFiles,
      probes,
      repeat: 1,
      exposure,
      fixedEnvironment,
    },
    fakeFactory
  );

  // 4. Historical provider timeout/retry contract reaches the wrapped client.
  assert.deepEqual(capturedOptions, {
    timeout: P6_3_RSEM_PROVIDER_CONTRACT.requestTimeoutMs,
    maxRetries: P6_3_RSEM_PROVIDER_CONTRACT.providerMaxRetries,
  });
  assert(capturedBody, "wrapped historical request body was not captured");

  // 5. Model/reasoning/output/schema/service/cache settings are still the
  //    historical frozen provider contract and schema.
  assert.equal(capturedBody.model, P6_3_RSEM_PROVIDER_CONTRACT.model);
  assert.equal(capturedBody.reasoning.effort, P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort);
  assert.equal(capturedBody.max_output_tokens, P6_3_RSEM_PROVIDER_CONTRACT.maxOutputTokens);
  assert.equal(capturedBody.store, P6_3_RSEM_PROVIDER_CONTRACT.storeResponses);
  assert.equal(capturedBody.service_tier, P6_3_RSEM_PROVIDER_CONTRACT.serviceTier);
  assert.equal(capturedBody.prompt_cache_options.mode, P6_3_RSEM_PROVIDER_CONTRACT.promptCacheMode);
  assert.deepEqual(capturedBody.text.format.schema, buildP63RSemSchemaP62Compatible(probes));

  // 6. The only model-facing protocol change is explicit and versioned:
  //    E_fixed is a distinct prefix, then the exact historical Rsem prompt.
  assert.equal(capturedBody.instructions, P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS);
  assert.equal(
    P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256,
    sha256(P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS)
  );
  assert(Array.isArray(capturedBody.input));
  assert.equal(capturedBody.input.length, 1);
  const content = capturedBody.input[0].content;
  assert.equal(typeof content, "string");
  const fixedSection = serializeFixedEnvironmentForModel(fixedEnvironment);
  const historicalPrompt = buildP63RSemPromptP62Compatible(contextFiles, probes);
  assert.equal(content, `${fixedSection}\n\n${historicalPrompt}`);
  assert.equal(countOccurrences(content, fixedEnvironment.modelVisibleText), 1);
  assert(content.indexOf("FIXED ENVIRONMENT SPECIFICATION") < content.indexOf("REPOSITORY FILES:"));

  // 7. The fake completed response traversed the real historical parser/scorer.
  assert.equal(outcome.failureDomain, "none");
  assert.equal(outcome.executionStatus, "ok");
  assert.equal(outcome.semanticScore, 1);
  assert.equal(outcome.protocolValid, true);
  assert.equal(outcome.passed, null);
  assert.equal(outcome.diagnosticSummary.booleanCorrect, 12);
  assert.equal(outcome.diagnosticSummary.booleanTotal, 12);

  // 8. Artifact exposure is untouched by E_fixed; no fixed tokens are folded
  //    into B_expose/actualExposedTokens.
  assert.deepEqual(outcome.exposure, exposure);
  assert.equal(outcome.exposure.budgetTokens, 123);
  assert.equal(outcome.exposure.actualExposedTokens, 37);

  // 9. Exact fixed-environment identity and snapshot are persisted per cell.
  const expectedIdentity = fixedEnvironmentIdentity(fixedEnvironment);
  assert.equal(outcome.diagnosticSummary.fixedEnvironmentIdentity, expectedIdentity);
  assert.equal(
    outcome.diagnosticSummary.fixedEnvironmentModelVisibleTokens,
    fixedEnvironment.modelVisibleTokens
  );
  const artifact = outcome.artifactPayload as any;
  assert.equal(artifact.executorVersion, P6_3_V3_RSEM_EXECUTOR_VERSION);
  assert.equal(artifact.promptVersion, P6_3_V3_RSEM_PROMPT_VERSION);
  assert.equal(artifact.outputInstructionsSha256, P6_3_V3_RSEM_OUTPUT_INSTRUCTIONS_SHA256);
  assert.deepEqual(artifact.fixedEnvironment, fixedEnvironmentLogSnapshot(fixedEnvironment));
  assert.equal(artifact.fixedEnvironment.identity, expectedIdentity);
  assert.equal(artifact.result.booleanAccuracy, 1);

  // 10. Source-level budget separation and no hidden run-start responsibilities.
  assert.ok(!/budgetTokens\s*[:=][^\n]*(modelVisibleTokens|fixedEnvironment)/.test(v3ExecutableSource));
  assert.ok(!/actualExposedTokens\s*[:=][^\n]*(modelVisibleTokens|fixedEnvironment)/.test(v3ExecutableSource));
  assert.ok(!v3ExecutableSource.includes("GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION"));
  assert.ok(!v3ExecutableSource.includes("GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION"));

  // 11. Request transformation is non-mutating with respect to the historical
  //     request object: runRSemRepeat builds it; the proxy sends a derived copy.
  assert.ok(v3ExecutableSource.includes("...historicalBody"));
  assert.ok(v3ExecutableSource.includes("input: transformedInput"));

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-executor-pr-c",
    executorVersion: P6_3_V3_RSEM_EXECUTOR_VERSION,
    promptVersion: P6_3_V3_RSEM_PROMPT_VERSION,
    fixedEnvironmentIdentity: expectedIdentity,
    verified: [
      "historical-rsem-executor-remains-v2-only",
      "v3-rsem-consumes-prebuilt-e-fixed-only",
      "historical-runRSemRepeat-remains-scientific-owner",
      "historical-timeout-retry-contract-preserved",
      "historical-provider-schema-contract-preserved",
      "e-fixed-prefix-plus-exact-historical-probe-prompt",
      "historical-parser-scorer-exercised-through-fake-completed-response",
      "artifact-budget-accounting-excludes-e-fixed",
      "cell-artifact-persists-fixed-environment-identity-and-snapshot",
      "run-start-provenance-remains-outside-pr-c",
      "request-transformation-does-not-mutate-historical-request-object",
    ],
  }, null, 2));
}

function successfulProbeResponse(probeBank: readonly GeneratedProbe[]) {
  const answers = Object.fromEntries(
    probeBank.map((probe) => [probe.probeId, String(Boolean(probe.correctAnswer))])
  );
  return {
    id: "resp_offline_p6_3_v3_rsem",
    model: P6_3_RSEM_PROVIDER_CONTRACT.model,
    status: "completed",
    output_text: JSON.stringify(answers),
    output: [],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

function countOccurrences(value: string, needle: string): number {
  return needle ? value.split(needle).length - 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stripComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
