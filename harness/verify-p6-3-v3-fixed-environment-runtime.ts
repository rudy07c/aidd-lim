import assert from "assert";
import {
  createFixedEnvironmentBinding,
  FIXED_ENVIRONMENT_LOG_SCHEMA_VERSION,
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  serializeFixedEnvironmentForModel,
} from "./src/context/fixed-environment-runtime";
import { buildOpenAIUserMessage } from "./src/agent-backend/openai/shared";
import { buildOpenAIV3FixedEnvironmentUserMessage } from "./src/agent-backend/openai/v3-fixed-environment";
import { buildPRUserMessage } from "./src/agent-backend/openai/research-stateless-pr";
import { buildARUserMessage } from "./src/agent-backend/openai/research-stateless-ar";
import {
  ResearchStatelessEpisodeRunner,
  type ResearchStatelessModelInput,
  type ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import { ExplorationBudget } from "./src/context/exploration-budget";
import { WorkingSetManager } from "./src/context/working-set-manager";
import { countCanonicalFileContentTokens } from "./src/measurement/token-counter";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const PROTOCOL_ID = "p6-3-v3-fixed-environment-verifier";

function makeBinding(text = "interface WorldProtocol { reset(seed: number): WorldState; }") {
  return createFixedEnvironmentBinding({
    sourceRepositorySha256: HEX_A,
    surfaceSpecVersion: "world-protocol-surface-v1",
    surfaceSpecSha256: HEX_B,
    modelVisibleText: text,
  });
}

function makeAgentInput(fixedEnvironment: ReturnType<typeof makeBinding> | null | undefined) {
  return {
    contextFiles: {
      "src/example.ts": "export const x = 1;",
    },
    visibleInstruction: "Change x without breaking the public contract.",
    fixedEnvironment,
    contextBudget: 505 as const,
  };
}

function makeResearchInput(fixedEnvironment: ReturnType<typeof makeBinding> | null | undefined) {
  return {
    visibleInstruction: "Change x without breaking the public contract.",
    artifactEvidence: [] as string[],
    explicitMemory: null,
    fixedEnvironment,
    runtimeObservation: null,
  };
}

function countFixedSections(value: string): number {
  return value.split("FIXED ENVIRONMENT SPECIFICATION:").length - 1;
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

async function verifyResearchStatelessPropagation(
  binding: ReturnType<typeof makeBinding>
): Promise<Record<string, unknown>> {
  const workingSet = new WorkingSetManager(505);
  const exploration = new ExplorationBudget({
    maxRetrievalOperations: 2,
    maxCumulativeRetrievedTokens: 1000,
    maxModelCalls: 2,
    maxDecisionRounds: 2,
  });
  const seen: Readonly<ResearchStatelessModelInput>[] = [];
  const runner = new ResearchStatelessEpisodeRunner({
    condition: "PR",
    taskId: "T-fixed-environment",
    visibleInstruction: "Preserve the fixed environment contract.",
    protocolId: PROTOCOL_ID,
    fixedEnvironment: binding,
    workingSet,
    explorationBudget: exploration,
    executorFactory: () => ({
      async runFresh(input) {
        seen.push(input);
        return {
          decision: "continue",
          rawResponse: "offline",
          transport: validTransport(),
        };
      },
    }),
  });

  const before = workingSet.snapshot();
  await runner.runStep();
  await runner.runStep();
  const after = workingSet.snapshot();
  const telemetry = runner.telemetry();

  assert.strictEqual(seen.length, 2);
  for (const input of seen) {
    assert.ok(input.fixedEnvironment);
    assert.strictEqual(
      fixedEnvironmentIdentity(input.fixedEnvironment!),
      fixedEnvironmentIdentity(binding)
    );
    assert.strictEqual(input.artifactEvidence.length, 0);
  }
  assert.strictEqual(before.artifactTokens, 0);
  assert.strictEqual(after.artifactTokens, 0);
  assert.strictEqual(before.currentTokenUsage, after.currentTokenUsage);
  assert.strictEqual(telemetry.workingSet.currentTokenUsage, 0);
  assert.strictEqual(telemetry.steps.length, 2);
  assert.strictEqual(
    telemetry.steps[0].modelInputHash,
    telemetry.steps[1].modelInputHash,
    "unchanged E_fixed + unchanged empty working set should reconstruct identical fresh input"
  );

  return {
    freshSteps: seen.length,
    fixedEnvironmentIdentity: fixedEnvironmentIdentity(binding),
    bWorkTokensBefore: before.currentTokenUsage,
    bWorkTokensAfter: after.currentTokenUsage,
    modelInputHashStable: telemetry.steps[0].modelInputHash === telemetry.steps[1].modelInputHash,
  };
}

async function main(): Promise<void> {
  const binding = makeBinding();

  // 1. Binding has stable run-fixed identity and canonical model-visible accounting.
  const identity1 = fixedEnvironmentIdentity(binding);
  const identity2 = fixedEnvironmentIdentity(binding);
  assert.strictEqual(identity1, identity2);
  assert.ok(binding.modelVisibleTokens > 0);
  assert.ok(Object.isFrozen(binding));

  // 2. Historical mutation prompt remains byte-for-byte unchanged and ignores E_fixed.
  const historicalOmitted = buildOpenAIUserMessage(makeAgentInput(undefined));
  const historicalNull = buildOpenAIUserMessage(makeAgentInput(null));
  const historicalWithBinding = buildOpenAIUserMessage(makeAgentInput(binding));
  assert.strictEqual(historicalOmitted, historicalNull);
  assert.strictEqual(historicalOmitted, historicalWithBinding);
  assert.ok(!historicalOmitted.includes("FIXED ENVIRONMENT SPECIFICATION"));

  const historicalPROmitted = buildPRUserMessage(makeResearchInput(undefined));
  const historicalPRNull = buildPRUserMessage(makeResearchInput(null));
  assert.strictEqual(historicalPROmitted, historicalPRNull);
  assert.strictEqual(countFixedSections(historicalPROmitted), 0);

  const historicalAROmitted = buildARUserMessage(makeResearchInput(undefined));
  const historicalARNull = buildARUserMessage(makeResearchInput(null));
  assert.strictEqual(historicalAROmitted, historicalARNull);
  assert.strictEqual(countFixedSections(historicalAROmitted), 0);

  // 3. V3 mutation + PR/AR render E_fixed exactly once and outside artifact evidence.
  assert.throws(
    () => buildOpenAIV3FixedEnvironmentUserMessage(makeAgentInput(null)),
    /requires fixedEnvironment/
  );
  const rendered = buildOpenAIV3FixedEnvironmentUserMessage(makeAgentInput(binding));
  const fixedRendered = serializeFixedEnvironmentForModel(binding);
  assert.strictEqual(countFixedSections(rendered), 1);
  assert.ok(rendered.includes(fixedRendered));
  const fixedIndex = rendered.indexOf("FIXED ENVIRONMENT SPECIFICATION:");
  const repoIndex = rendered.indexOf("CURRENT REPOSITORY:");
  assert.ok(fixedIndex >= 0 && repoIndex > fixedIndex);

  const prRendered = buildPRUserMessage(makeResearchInput(binding));
  const arRendered = buildARUserMessage(makeResearchInput(binding));
  for (const researchRendered of [prRendered, arRendered]) {
    assert.strictEqual(countFixedSections(researchRendered), 1);
    assert.ok(researchRendered.includes(fixedRendered));
    assert.ok(
      researchRendered.indexOf("FIXED ENVIRONMENT SPECIFICATION:") <
        researchRendered.indexOf("CURRENT WORKING SET:")
    );
  }

  // 4. Artifact budget accounting is unchanged by E_fixed.
  const agentInputWithoutFixed = makeAgentInput(null);
  const agentInputWithFixed = makeAgentInput(binding);
  const artifactTokensBefore = countCanonicalFileContentTokens(
    agentInputWithoutFixed.contextFiles
  );
  const artifactTokensAfter = countCanonicalFileContentTokens(
    agentInputWithFixed.contextFiles
  );
  assert.strictEqual(artifactTokensBefore, artifactTokensAfter);
  assert.ok(!JSON.stringify(agentInputWithFixed.contextFiles).includes(binding.modelVisibleText));

  // 5. Exact log snapshot reconstructs E_fixed without contaminating artifact context.
  const snapshot = fixedEnvironmentLogSnapshot(binding);
  assert.strictEqual(snapshot.schemaVersion, FIXED_ENVIRONMENT_LOG_SCHEMA_VERSION);
  assert.strictEqual(snapshot.identity, identity1);
  assert.strictEqual(snapshot.modelVisibleText, binding.modelVisibleText);
  assert.strictEqual(snapshot.modelVisibleSha256, binding.modelVisibleSha256);
  assert.strictEqual(snapshot.modelVisibleTokens, binding.modelVisibleTokens);
  assert.strictEqual(snapshot.surfaceSpecSha256, binding.surfaceSpecSha256);
  assert.strictEqual(snapshot.sourceRepositorySha256, binding.sourceRepositorySha256);
  assert.ok(JSON.stringify(snapshot).includes(binding.modelVisibleText));
  assert.ok(!JSON.stringify(agentInputWithFixed.contextFiles).includes(snapshot.modelVisibleSha256));

  // 6. Research-stateless fresh steps replay the same E_fixed without charging B_work.
  const researchStateless = await verifyResearchStatelessPropagation(binding);

  // 7. Changing model-visible environment text changes binding identity.
  const changed = makeBinding(
    "interface WorldProtocol { reset(seed: number): WorldState; applyOperation(state: WorldState, name: string): OperationResult; }"
  );
  assert.notStrictEqual(binding.modelVisibleSha256, changed.modelVisibleSha256);
  assert.notStrictEqual(fixedEnvironmentIdentity(binding), fixedEnvironmentIdentity(changed));

  // 8. Invalid provenance is rejected before prompt construction.
  assert.throws(
    () =>
      createFixedEnvironmentBinding({
        sourceRepositorySha256: "not-a-sha",
        surfaceSpecVersion: "world-protocol-surface-v1",
        surfaceSpecSha256: HEX_B,
        modelVisibleText: "x",
      }),
    /sourceRepositorySha256/
  );

  console.log("P6-3 v3 fixed-environment runtime verifier: PASS");
  console.log(
    JSON.stringify(
      {
        identity: identity1,
        modelVisibleTokens: binding.modelVisibleTokens,
        artifactTokens: artifactTokensBefore,
        historicalNoopPreserved: true,
        logSnapshotSchemaVersion: snapshot.schemaVersion,
        fixedEnvironmentSectionCounts: {
          standardMutation: countFixedSections(rendered),
          privilegedRetrieved: countFixedSections(prRendered),
          agentRetrieved: countFixedSections(arRendered),
        },
        researchStateless,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
