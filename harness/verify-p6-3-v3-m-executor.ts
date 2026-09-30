import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  buildOpenAIV3FixedEnvironmentUserMessage,
  OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_VERSION,
} from "./src/agent-backend/openai/v3-fixed-environment";
import {
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  serializeFixedEnvironmentForModel,
} from "./src/context/fixed-environment-runtime";
import {
  buildGenerationZeroFixedEnvironment,
} from "./src/context/generation-zero-fixed-environment";
import {
  P6_3_MUTATION_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-mutation-protocol-parity";
import {
  P6_3_V3_M_EXECUTOR_VERSION,
} from "./src/p6/p6-3-v3-m-executor";
import {
  serializeStaticRepositoryPayload,
} from "./src/context/static-exposure";

const harnessDir = __dirname;
const v3ExecutorPath = path.join(harnessDir, "src", "p6", "p6-3-v3-m-executor.ts");
const historicalExecutorPath = path.join(harnessDir, "src", "p6", "p6-3-live-executors.ts");
const v3Source = fs.readFileSync(v3ExecutorPath, "utf8");
const historicalSource = fs.readFileSync(historicalExecutorPath, "utf8");

// 1. PR B is additive: historical executeP63MCell/executeP63RSemCell remain the
//    only functions in the historical executor file, and no v3 executor/backend
//    wiring is introduced there.
assert.ok(historicalSource.includes("export async function executeP63MCell"));
assert.ok(historicalSource.includes("export async function executeP63RSemCell"));
assert.ok(!historicalSource.includes("executeP63V3MCell"));
assert.ok(!historicalSource.includes("OpenAIV3FixedEnvironmentBackend"));
assert.ok(!historicalSource.includes("p6-3-v3-m-executor"));

// 2. The v3 executor is a distinct, versioned production surface.
assert.equal(P6_3_V3_M_EXECUTOR_VERSION, "p6-3-v3-m-executor-v1");
assert.ok(v3Source.includes("export async function executeP63V3MCell"));

// 3. The executor consumes an already-built binding. It must never construct
//    E_fixed itself or import the Generation-0 builder.
assert.ok(!v3Source.includes("generation-zero-fixed-environment"));
assert.ok(!v3Source.includes("buildGenerationZeroFixedEnvironment"));
assert.ok(!v3Source.includes("createFixedEnvironmentBinding"));
assert.ok(v3Source.includes("assertFixedEnvironmentBinding(args.fixedEnvironment)"));

// 4. The only mutation backend used by PR B is the dedicated v3 backend, and
//    the exact caller-supplied binding is forwarded unchanged.
assert.ok(v3Source.includes("new OpenAIV3FixedEnvironmentBackend"));
assert.ok(v3Source.includes("fixedEnvironment: args.fixedEnvironment"));
assert.ok(!v3Source.includes("new OpenAIBackend"));

// 5. Provider execution settings remain the already-frozen P6-3/P6-2-compatible
//    mutation contract. PR B changes prompt framing only through the dedicated
//    v3 backend; it does not introduce a new model/reasoning/retry contract.
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.model, "gpt-5.6-luna");
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.reasoningEffort, "high");
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens, 7000);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs, 180000);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.providerMaxRetries, 2);
assert.equal(P6_3_MUTATION_PROVIDER_CONTRACT.maxToolRounds, 0);
assert.ok(v3Source.includes("model: P6_3_MUTATION_PROVIDER_CONTRACT.model"));
assert.ok(v3Source.includes("reasoningEffort: P6_3_MUTATION_PROVIDER_CONTRACT.reasoningEffort"));
assert.ok(v3Source.includes("maxOutputTokens: P6_3_MUTATION_PROVIDER_CONTRACT.maxOutputTokens"));
assert.ok(v3Source.includes("requestTimeoutMs: P6_3_MUTATION_PROVIDER_CONTRACT.requestTimeoutMs"));
assert.ok(v3Source.includes("maxRetries: P6_3_MUTATION_PROVIDER_CONTRACT.providerMaxRetries"));
assert.ok(v3Source.includes("maxToolRounds: P6_3_MUTATION_PROVIDER_CONTRACT.maxToolRounds"));

// 6. B_expose/contextBudget remains artifact-only: the executor forwards the
//    budget and exposure unchanged and never arithmetically mixes E_fixed token
//    accounting into either value.
assert.ok(v3Source.includes("contextBudget: args.contextBudget"));
assert.ok(v3Source.includes("args.exposure"));
assert.ok(!/contextBudget\s*[:=][^\n]*(modelVisibleTokens|fixedEnvironment)/.test(v3Source));
assert.ok(!/budgetTokens\s*[:=][^\n]*(modelVisibleTokens|fixedEnvironment)/.test(v3Source));
assert.ok(!/actualExposedTokens\s*[:=][^\n]*(modelVisibleTokens|fixedEnvironment)/.test(v3Source));

// 7. The exact fixed-environment identity/snapshot is persisted into each M
//    outcome so a later run-level gate can prove equality across arms/repeats.
assert.ok(v3Source.includes("fixedEnvironmentIdentity(fixedEnvironment)"));
assert.ok(v3Source.includes("fixedEnvironmentLogSnapshot(fixedEnvironment)"));
assert.ok(v3Source.includes("fixedEnvironmentIdentity: environmentIdentity"));
assert.ok(v3Source.includes("fixedEnvironmentModelVisibleTokens"));

// 8. Prompt-level separation is concrete, not merely documented: E_fixed is a
//    distinct section before CURRENT REPOSITORY and the artifact serializer is
//    unchanged by its presence.
const fixtureRepository = {
  "src/a.ts": "export const a = 1;",
  "tests/a.test.ts": "export const expected = 1;",
};
const fixtureBinding = buildGenerationZeroFixedEnvironment({
  repositoryFiles: fixtureRepository,
});
const fixtureMessage = buildOpenAIV3FixedEnvironmentUserMessage({
  contextFiles: { "src/a.ts": fixtureRepository["src/a.ts"] },
  visibleInstruction: "offline v3 M executor verification fixture",
  fixedEnvironment: fixtureBinding,
  contextBudget: 123,
});
const fixedSection = serializeFixedEnvironmentForModel(fixtureBinding);
assert.ok(fixtureMessage.includes(fixedSection));
assert.ok(fixtureMessage.indexOf("FIXED ENVIRONMENT SPECIFICATION") < fixtureMessage.indexOf("CURRENT REPOSITORY:"));
assert.equal(countOccurrences(fixtureMessage, fixtureBinding.modelVisibleText), 1);
assert.equal(
  serializeStaticRepositoryPayload({ "src/a.ts": fixtureRepository["src/a.ts"] }),
  "\n--- src/a.ts ---\nexport const a = 1;\n"
);
assert.ok(!serializeStaticRepositoryPayload({ "src/a.ts": fixtureRepository["src/a.ts"] }).includes(fixtureBinding.modelVisibleText));

// 9. The v3 prompt/backend provenance is versioned independently from the
//    historical mutation prompt.
assert.equal(OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_VERSION, "stage1-worker-v3-fixed-environment-v1");

// 10. Snapshot/identity reconstruction is internally consistent and remains
//     outside the artifact exposure evidence structure.
const snapshot = fixedEnvironmentLogSnapshot(fixtureBinding);
assert.equal(snapshot.identity, fixedEnvironmentIdentity(fixtureBinding));
assert.equal(snapshot.modelVisibleTokens, fixtureBinding.modelVisibleTokens);
assert.equal(snapshot.sourceRepositorySha256, fixtureBinding.sourceRepositorySha256);

// 11. The v3 executor still reuses the P6-2-compatible scientific semantics:
//     shared path validation, scoring, and repeat classification rather than a
//     v3-only success definition.
assert.ok(v3Source.includes("validateP63MutationPathsP62Compatible"));
assert.ok(v3Source.includes("runScoring"));
assert.ok(v3Source.includes("classifyP62MRepeat(raw, \"primary\")"));
assert.ok(v3Source.includes("scoring.protocolContractViolated"));

console.log(JSON.stringify({
  status: "ok",
  slice: "p6-3-v3-m-executor-pr-b",
  executorVersion: P6_3_V3_M_EXECUTOR_VERSION,
  promptVersion: OPENAI_V3_FIXED_ENVIRONMENT_PROMPT_VERSION,
  fixedEnvironmentIdentity: fixedEnvironmentIdentity(fixtureBinding),
  verified: [
    "historical-executors-remain-v2-only",
    "v3-m-executor-is-distinct-and-versioned",
    "executor-consumes-prebuilt-binding-and-never-builds-e-fixed",
    "dedicated-v3-backend-receives-exact-binding",
    "provider-contract-remains-p6-2-compatible",
    "artifact-budget-accounting-excludes-e-fixed",
    "cell-artifact-persists-fixed-environment-identity-and-snapshot",
    "prompt-keeps-fixed-environment-separate-from-repository-evidence",
    "v3-prompt-provenance-is-versioned",
    "fixed-environment-snapshot-reconstructs-identity",
    "m-scoring-path-validation-and-failure-classification-remain-shared",
  ],
}, null, 2));

function countOccurrences(value: string, needle: string): number {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}
