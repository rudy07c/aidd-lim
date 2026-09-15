import assert from "assert";
import {
  ExplorationBudget,
  ExplorationLimits,
} from "./src/context/exploration-budget";
import {
  RetrievedEpisodeRuntime,
  RetrievedEpisodeRuntimeFailure,
} from "./src/context/retrieved-episode-runtime";
import { WorkingSetManager } from "./src/context/working-set-manager";
import type {
  ResearchStatelessCondition,
  ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import {
  ResearchStatelessProviderFailure,
  ResearchStatelessCensoredStatus,
} from "./src/agent-backend/research-stateless-provider-failure";
import { OpenAIResearchStatelessPRExecutor } from "./src/agent-backend/openai/research-stateless-pr";
import { OpenAIResearchStatelessARExecutor } from "./src/agent-backend/openai/research-stateless-ar";
import { shouldCensorGeneration } from "./src/orchestrator";

const PROTOCOL_ID = "p5.5-error-separation-v1";

function limits(overrides: Partial<ExplorationLimits> = {}): ExplorationLimits {
  return {
    maxRetrievalOperations: 8,
    maxCumulativeRetrievedTokens: 10_000,
    maxModelCalls: 8,
    maxDecisionRounds: 8,
    ...overrides,
  };
}

function validTransport(): ResearchStatelessTransportAttestation {
  return {
    protocolId: PROTOCOL_ID,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  };
}

async function verifyEmaxExhaustionBecomesPersistableRuntimeFailure() {
  const explorationBudget = new ExplorationBudget(
    limits({ maxModelCalls: 1, maxDecisionRounds: 1 })
  );
  const runtime = new RetrievedEpisodeRuntime<"retrieve", never>({
    condition: "AR",
    taskId: "T-e-max-exhaustion",
    visibleInstruction: "Retrieve once, then attempt another fresh inference.",
    protocolId: PROTOCOL_ID,
    repositoryFiles: {
      "src/a.ts": "export const a = 1;\n",
    },
    workingSet: new WorkingSetManager(500),
    explorationBudget,
    executorFactory: () => ({
      async runFresh() {
        return {
          decision: "retrieve" as const,
          rawResponse: "retrieve",
          transport: validTransport(),
        };
      },
    }),
    policyFactory: (gateway) => ({
      condition: "AR" as const,
      toolDefinitions: [],
      async resolve() {
        await gateway.readChunk({ path: "src/a.ts", startLine: 1, endLine: 1 });
        return { kind: "retrieved" as const };
      },
    }),
  });

  let failure: unknown;
  try {
    await runtime.run();
    assert.fail("expected E_max exhaustion");
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof RetrievedEpisodeRuntimeFailure);
  assert.match(failure.message, /E_max cannot reserve research-stateless inference/);
  assert.strictEqual(failure.observableSteps.length, 1);
  assert.strictEqual(failure.telemetry.steps.length, 1);
  assert.strictEqual(failure.retrievals.length, 1);
  assert.deepStrictEqual(failure.telemetry.explorationBudget.used, {
    retrievalOperations: 1,
    cumulativeRetrievedTokens: failure.retrievals[0].exposedTokens,
    modelCalls: 1,
    decisionRounds: 1,
  });
  assert.strictEqual(failure.telemetry.explorationBudget.pendingRetrieval, null);

  return {
    wrappedAsRuntimeFailure: true,
    observableSteps: failure.observableSteps.length,
    retrievals: failure.retrievals.length,
    used: failure.telemetry.explorationBudget.used,
  };
}

async function verifyOpenAIExecutorsClassifyIncompleteResponses() {
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-not-used";
  try {
    const options = {
      model: "gpt-5.6-luna",
      reasoningEffort: "high" as const,
      maxOutputTokens: 1024,
      requestTimeoutMs: 1000,
      maxRetries: 0,
      storeResponses: false,
      serviceTier: "default" as const,
      promptCacheMode: "implicit" as const,
    };
    const fakeIncompleteResponse = {
      id: "resp-incomplete-test",
      model: "gpt-5.6-luna",
      status: "incomplete",
      output: [],
      output_text: "",
      usage: null,
      service_tier: "default",
      incomplete_details: { reason: "max_output_tokens" },
      error: null,
    };

    const executors = {
      PR: new OpenAIResearchStatelessPRExecutor(options, PROTOCOL_ID, []),
      AR: new OpenAIResearchStatelessARExecutor(options, PROTOCOL_ID, []),
    } as const;

    const results: Record<string, unknown> = {};
    for (const [condition, executor] of Object.entries(executors)) {
      (executor as any).client.responses.create = async () => fakeIncompleteResponse;
      let observed: unknown;
      try {
        await executor.runFresh({
          visibleInstruction: "Simulate incomplete provider response.",
          artifactEvidence: [],
          explicitMemory: null,
        });
        assert.fail("expected incomplete response failure");
      } catch (error) {
        observed = error;
      }
      assert.ok(observed instanceof ResearchStatelessProviderFailure);
      assert.strictEqual(observed.executionStatus, "response-incomplete");
      assert.strictEqual(observed.normalizedError.category, "response");
      assert.strictEqual(shouldCensorGeneration(observed.executionStatus), true);
      results[condition] = {
        executionStatus: observed.executionStatus,
        censored: true,
      };
    }
    return results;
  } finally {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
}

async function verifyProviderFailuresRemainCensorable() {
  const censorStatuses: ResearchStatelessCensoredStatus[] = [
    "provider-error",
    "response-failed",
    "response-incomplete",
    "response-not-completed",
    "response-refusal",
  ];
  for (const status of censorStatuses) {
    assert.strictEqual(
      shouldCensorGeneration(status),
      true,
      `${status} must remain in the P1 censor set`
    );
  }
  assert.strictEqual(shouldCensorGeneration("tool-error"), false);

  const executorClassification = await verifyOpenAIExecutorsClassifyIncompleteResponses();
  const conditionResults: Record<string, unknown> = {};
  for (const condition of ["PR", "AR"] as const satisfies readonly ResearchStatelessCondition[]) {
    const providerFailure = new ResearchStatelessProviderFailure({
      executionStatus: "response-not-completed",
      normalizedError: {
        category: "response",
        message: `${condition} simulated response.status != completed`,
        retryable: false,
      },
      providerTelemetry: {
        provider: "openai",
        requestedModel: "gpt-5.6-luna",
        actualModel: "gpt-5.6-luna",
        responseId: `resp-${condition}`,
        responseStatus: "queued",
        tokenUsage: null,
        latencyMs: 1,
        costUsd: null,
      },
    });

    const runtime = new RetrievedEpisodeRuntime<"unused", never>({
      condition,
      taskId: `T-provider-${condition}`,
      visibleInstruction: "Simulate a provider response failure.",
      protocolId: PROTOCOL_ID,
      repositoryFiles: {},
      workingSet: new WorkingSetManager(200),
      explorationBudget: new ExplorationBudget(limits()),
      executorFactory: () => ({
        async runFresh() {
          throw providerFailure;
        },
      }),
      policyFactory: () => ({
        condition,
        toolDefinitions: [],
        async resolve() {
          throw new Error("policy must not run after provider failure");
        },
      }),
    });

    let observed: unknown;
    try {
      await runtime.run();
      assert.fail("expected provider failure");
    } catch (error) {
      observed = error;
    }

    assert.strictEqual(
      observed,
      providerFailure,
      `${condition} runtime must rethrow provider failure unchanged`
    );
    assert.ok(!(observed instanceof RetrievedEpisodeRuntimeFailure));
    assert.ok(observed instanceof ResearchStatelessProviderFailure);
    assert.strictEqual(observed.executionStatus, "response-not-completed");
    assert.strictEqual(shouldCensorGeneration(observed.executionStatus), true);
    conditionResults[condition] = {
      rethrownUnchanged: true,
      executionStatus: observed.executionStatus,
      censored: true,
    };
  }

  return {
    censorStatuses,
    executorClassification,
    conditionResults,
  };
}

async function main() {
  const eMax = await verifyEmaxExhaustionBecomesPersistableRuntimeFailure();
  const provider = await verifyProviderFailuresRemainCensorable();
  console.log(JSON.stringify({
    status: "ok",
    p5_5Slice: "typed-error-separation",
    eMax,
    provider,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
