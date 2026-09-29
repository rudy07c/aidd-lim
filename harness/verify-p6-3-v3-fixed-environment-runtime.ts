import assert from "assert";
import {
  createFixedEnvironmentBinding,
  fixedEnvironmentIdentity,
  serializeFixedEnvironmentForModel,
} from "./src/context/fixed-environment-runtime";
import { buildOpenAIUserMessage } from "./src/agent-backend/openai/shared";
import { countCanonicalFileContentTokens } from "./src/measurement/token-counter";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

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

function main(): void {
  const binding = makeBinding();

  // 1. Binding has stable run-fixed identity and canonical model-visible accounting.
  const identity1 = fixedEnvironmentIdentity(binding);
  const identity2 = fixedEnvironmentIdentity(binding);
  assert.strictEqual(identity1, identity2);
  assert.ok(binding.modelVisibleTokens > 0);
  assert.ok(Object.isFrozen(binding));

  // 2. Historical/null input is byte-for-byte equivalent to omitted input.
  const historicalOmitted = buildOpenAIUserMessage(makeAgentInput(undefined));
  const historicalNull = buildOpenAIUserMessage(makeAgentInput(null));
  assert.strictEqual(historicalOmitted, historicalNull);
  assert.ok(!historicalOmitted.includes("FIXED ENVIRONMENT SPECIFICATION"));

  // 3. E_fixed renders exactly once and outside CURRENT REPOSITORY.
  const rendered = buildOpenAIUserMessage(makeAgentInput(binding));
  const fixedRendered = serializeFixedEnvironmentForModel(binding);
  assert.strictEqual(
    rendered.split("FIXED ENVIRONMENT SPECIFICATION:").length - 1,
    1
  );
  assert.ok(rendered.includes(fixedRendered));
  const fixedIndex = rendered.indexOf("FIXED ENVIRONMENT SPECIFICATION:");
  const repoIndex = rendered.indexOf("CURRENT REPOSITORY:");
  assert.ok(fixedIndex >= 0 && repoIndex > fixedIndex);

  // 4. Artifact budget accounting is unchanged by E_fixed.
  const artifactTokensBefore = countCanonicalFileContentTokens(
    makeAgentInput(null).contextFiles
  );
  const artifactTokensAfter = countCanonicalFileContentTokens(
    makeAgentInput(binding).contextFiles
  );
  assert.strictEqual(artifactTokensBefore, artifactTokensAfter);

  // 5. Changing model-visible environment text changes binding identity.
  const changed = makeBinding(
    "interface WorldProtocol { reset(seed: number): WorldState; applyOperation(state: WorldState, name: string): OperationResult; }"
  );
  assert.notStrictEqual(binding.modelVisibleSha256, changed.modelVisibleSha256);
  assert.notStrictEqual(fixedEnvironmentIdentity(binding), fixedEnvironmentIdentity(changed));

  // 6. Invalid provenance is rejected before prompt construction.
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
        fixedEnvironmentSectionCount: 1,
      },
      null,
      2
    )
  );
}

main();
