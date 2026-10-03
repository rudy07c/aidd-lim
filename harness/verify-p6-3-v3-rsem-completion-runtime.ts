import assert from "assert";
import * as path from "path";
import {
  loadDirRecursive,
  loadProbeMaterial,
  type P62ProbeClientFactory,
} from "./p6-af-baseline-live";
import {
  P6_3_RSEM_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-rsem-protocol-parity";
import {
  P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
  executeP63V3RSemCompletionCell,
} from "./src/p6/p6-3-v3-rsem-completion-executor";
import {
  buildP63V3RSemCompletionCellExposure,
  prepareP63V3RSemCompletionRun,
  P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION,
} from "./src/p6/p6-3-v3-rsem-completion-runner";
import {
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-v3-rsem-completion-predeclaration";

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryFiles: Record<string, string> = {};
  loadDirRecursive(
    path.join(syntheticWorldDir, "repository"),
    path.join(syntheticWorldDir, "repository"),
    repositoryFiles
  );
  const probes = loadProbeMaterial(syntheticWorldDir).booleanProbes;

  let fixedEnvironmentProvenance: any = null;
  let treatmentProvenance: any = null;
  const prepared = await prepareP63V3RSemCompletionRun({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance(value) {
        fixedEnvironmentProvenance = value;
      },
      persistRSemCompletionTreatmentProvenance(value) {
        treatmentProvenance = value;
      },
    },
  });

  assert.equal(P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION, "p6-3-v3-rsem-completion-runner-v1");
  assert.equal(prepared.plan.length, 72);
  assert.equal(prepared.planHash, P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256);
  assert.equal(prepared.plan[0].collectionSequence, 0);
  assert.equal(prepared.plan[0].canonicalV3Sequence, 792);
  assert.equal(prepared.plan[71].collectionSequence, 71);
  assert.equal(prepared.plan[71].canonicalV3Sequence, 863);
  assert.equal(
    prepared.provenance.fixedEnvironmentIdentity,
    P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  );
  assert.equal(
    fixedEnvironmentProvenance.fixedEnvironmentIdentity,
    P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  );
  assert.equal(treatmentProvenance.planHash, prepared.planHash);
  assert.equal(treatmentProvenance.liveAuthorized, false);
  assert.equal("executeMCell" in prepared.runStart, false);

  await assert.rejects(
    () =>
      prepareP63V3RSemCompletionRun({
        generationZeroRepositoryFiles: repositoryFiles,
        persistence: {
          persistRunFixedEnvironmentProvenance() {},
          persistRSemCompletionTreatmentProvenance() {},
        },
        runStartDependencies: {
          executeRSemCell: async () => {
            throw new Error("must never be callable");
          },
        } as any,
      }),
    /forbids executor overrides/
  );

  const exposure = buildP63V3RSemCompletionCellExposure({
    cell: prepared.plan[1],
    repositoryFiles,
    syntheticWorldDir,
    probePrompts: probes.map((probe) => probe.prompt),
  });
  assert.deepEqual(exposure.evidence.budgetTokens, prepared.plan[1].budgetTokens);

  let capturedOptions: any = null;
  let capturedBody: any = null;
  const fakeFactory: P62ProbeClientFactory = (options) => {
    capturedOptions = options;
    return {
      responses: {
        create: async (body: any) => {
          capturedBody = body;
          return {
            id: "resp_completion_fixture",
            model: P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.model,
            status: "completed",
            output_text: JSON.stringify(
              Object.fromEntries(
                probes.map((probe) => [
                  probe.probeId,
                  String(Boolean(probe.correctAnswer)),
                ])
              )
            ),
            output: [],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              total_tokens: 120,
              input_tokens_details: {
                cached_tokens: 0,
                cache_write_tokens: 0,
              },
              output_tokens_details: {
                reasoning_tokens: 0,
              },
            },
          };
        },
      },
    };
  };

  const outcome = await executeP63V3RSemCompletionCell(
    {
      contextFiles: exposure.contextFiles,
      probes,
      repeat: prepared.plan[1].repeat,
      exposure: exposure.evidence,
      fixedEnvironment: prepared.runStart.fixedEnvironment,
    },
    fakeFactory
  );

  assert.deepEqual(capturedOptions, {
    timeout: P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.requestTimeoutMs,
    maxRetries: P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
  });
  assert.equal(
    P6_3_RSEM_PROVIDER_CONTRACT.maxOutputTokens,
    8000
  );
  assert.equal(
    capturedBody.max_output_tokens,
    P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens
  );
  assert.equal(capturedBody.max_output_tokens, 32000);
  assert.equal(capturedBody.model, P6_3_RSEM_PROVIDER_CONTRACT.model);
  assert.equal(
    capturedBody.reasoning.effort,
    P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort
  );
  assert.equal(outcome.semanticScore, 1);
  assert.equal(outcome.protocolValid, true);
  assert.equal(outcome.diagnosticSummary.validity, "valid");
  assert.equal(
    outcome.diagnosticSummary.providerMaxOutputTokens,
    32000
  );
  assert.equal(
    (outcome.artifactPayload as any).executorVersion,
    P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION
  );
  assert.equal(
    (outcome.artifactPayload as any).result.modelProvenance.maxOutputTokens,
    32000
  );

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-completion-runtime",
    providerCallsMade: false,
    freshRSemLogicalCells: prepared.plan.length,
    planHash: prepared.planHash,
    fixedEnvironmentIdentity:
      prepared.provenance.fixedEnvironmentIdentity,
    scientificMaxOutputTokens:
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
    verified: [
      "72-cell-fresh-rsem-plan",
      "canonical-v3-sequences-792-863",
      "frozen-plan-hash",
      "fixed-environment-identity-equals-inherited-source",
      "completion-context-does-not-expose-M-execution",
      "completion-executor-overrides-fail-closed",
      "scientific-provider-cap-amended-8000-to-32000-only-at-request-boundary",
      "scientific-sdk-retry-contract-preserved",
      "completion-artifact-provenance-normalized-to-32000",
      "provider-free-prepare-path",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
