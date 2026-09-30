// verify-p6-3-v3-generation-zero-fixed-environment.ts
//
// Offline gate for PR A: the Generation-0 FixedEnvironment production
// builder. Scope is deliberately narrow, per the frozen design boundary:
// this verifies ONLY that buildGenerationZeroFixedEnvironment() produces a
// correct, deterministic, leakage-free FixedEnvironmentBinding from a
// repository snapshot. It does not touch, import, or assert anything about
// executeP63MCell, executeP63RSemCell, or orchestrator.ts beyond confirming
// (by source inspection) that they remain untouched by this PR. No provider
// call is made and no scientific outcome data is read.

import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { countCanonicalTokens } from "./src/measurement/token-counter";
import {
  assertFixedEnvironmentBinding,
  fixedEnvironmentIdentity,
} from "./src/context/fixed-environment-runtime";
import {
  buildGenerationZeroFixedEnvironment,
  GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
  GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
} from "./src/context/generation-zero-fixed-environment";
import {
  FIXED_WORLD_PROTOCOL_SPEC,
  FIXED_WORLD_PROTOCOL_SPEC_VERSION,
} from "./src/context/fixed-world-protocol-spec";
import { serializeStaticRepositoryPayload } from "./src/context/static-exposure";

function sha256(value: string): string {
  return require("crypto").createHash("sha256").update(value, "utf8").digest("hex");
}

function loadRepositoryFiles(): Record<string, string> {
  const repositoryDir = path.join(
    __dirname,
    "..",
    "synthetic-world",
    "repository"
  );
  const result: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(repositoryDir, full).replace(/\\/g, "/");
        result[relative] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(repositoryDir);
  return result;
}

function reverseKeyOrder<T>(obj: Readonly<Record<string, T>>): Record<string, T> {
  const reversed: Record<string, T> = {};
  for (const key of Object.keys(obj).reverse()) {
    reversed[key] = obj[key];
  }
  return reversed;
}

function main(): void {
  const repositoryFiles = loadRepositoryFiles();
  assert.ok(
    Object.keys(repositoryFiles).length > 0,
    "fixture repository must not be empty"
  );

  // 1. Basic build succeeds and passes the runtime's own invariant checker.
  const binding = buildGenerationZeroFixedEnvironment({ repositoryFiles });
  assertFixedEnvironmentBinding(binding);

  // 2. sourceKind is generation-zero, per the frozen FixedEnvironmentBinding contract.
  assert.strictEqual(binding.sourceKind, "generation-zero");

  // 3. modelVisibleText is exactly FIXED_WORLD_PROTOCOL_SPEC — the builder
  //    must not paraphrase, truncate, or re-derive it.
  assert.strictEqual(binding.modelVisibleText, FIXED_WORLD_PROTOCOL_SPEC);
  assert.strictEqual(binding.surfaceSpecVersion, FIXED_WORLD_PROTOCOL_SPEC_VERSION);
  assert.strictEqual(binding.surfaceSpecSha256, sha256(FIXED_WORLD_PROTOCOL_SPEC));

  // 4. Canonical token count matches the existing canonical token counter exactly.
  assert.strictEqual(
    binding.modelVisibleTokens,
    countCanonicalTokens(FIXED_WORLD_PROTOCOL_SPEC)
  );

  // 5. Repository hash uses the already-frozen static repository serializer,
  //    not a second, divergent canonicalization rule.
  assert.strictEqual(
    binding.sourceRepositorySha256,
    sha256(serializeStaticRepositoryPayload(repositoryFiles))
  );

  // 6. Repository file INSERTION ORDER must not affect the hash: the same
  //    snapshot content, presented with reversed key order, yields the same
  //    sourceRepositorySha256.
  const reordered = reverseKeyOrder(repositoryFiles);
  const bindingReordered = buildGenerationZeroFixedEnvironment({
    repositoryFiles: reordered,
  });
  assert.strictEqual(
    bindingReordered.sourceRepositorySha256,
    binding.sourceRepositorySha256,
    "repository hash must be independent of file insertion order"
  );
  assert.strictEqual(
    fixedEnvironmentIdentity(bindingReordered),
    fixedEnvironmentIdentity(binding)
  );

  // 7. A single-byte content change anywhere in the snapshot changes the
  //    repository hash (and therefore the binding identity).
  const [oneFile] = Object.keys(repositoryFiles);
  const mutated = {
    ...repositoryFiles,
    [oneFile]: repositoryFiles[oneFile] + " ",
  };
  const bindingMutated = buildGenerationZeroFixedEnvironment({
    repositoryFiles: mutated,
  });
  assert.notStrictEqual(
    bindingMutated.sourceRepositorySha256,
    binding.sourceRepositorySha256,
    "a one-byte repository content change must change the repository hash"
  );
  assert.notStrictEqual(
    fixedEnvironmentIdentity(bindingMutated),
    fixedEnvironmentIdentity(binding)
  );

  // 8. A spec-text change changes the surface hash and binding identity.
  //    (Exercised directly against the lower-level runtime primitive, since
  //    FIXED_WORLD_PROTOCOL_SPEC itself is a frozen constant this PR must not
  //    mutate — this establishes that identity is sensitive to spec content,
  //    not that the frozen constant can be changed at runtime.)
  const tamperedSpecText = FIXED_WORLD_PROTOCOL_SPEC + "\n";
  const bindingTamperedSpec = require("./src/context/fixed-environment-runtime").createFixedEnvironmentBinding({
    sourceRepositorySha256: binding.sourceRepositorySha256,
    surfaceSpecVersion: FIXED_WORLD_PROTOCOL_SPEC_VERSION,
    surfaceSpecSha256: sha256(tamperedSpecText),
    modelVisibleText: tamperedSpecText,
  });
  assert.notStrictEqual(
    fixedEnvironmentIdentity(bindingTamperedSpec),
    fixedEnvironmentIdentity(binding)
  );

  // 9. Determinism: identical inputs reproduce an identical identity across
  //    repeated calls.
  const bindingAgain = buildGenerationZeroFixedEnvironment({ repositoryFiles });
  assert.strictEqual(
    fixedEnvironmentIdentity(bindingAgain),
    fixedEnvironmentIdentity(binding)
  );
  assert.deepStrictEqual(bindingAgain, binding);

  // 10. No provider call, no scientific-outcome read: builder's own source
  //     imports nothing from agent-backend, ground truth, or run logs.
  const builderSource = fs.readFileSync(
    path.join(__dirname, "src", "context", "generation-zero-fixed-environment.ts"),
    "utf8"
  );
  const forbiddenImportTokens = [
    "agent-backend",
    "ground_truth",
    "GroundTruth",
    "openai",
    "OpenAI",
    "heldout_tasks",
  ];
  for (const token of forbiddenImportTokens) {
    assert.ok(
      !builderSource.includes(token),
      `builder source must not reference "${token}" (no provider calls, no scientific-outcome reads)`
    );
  }

  // 11. M/Rsem/historical executors remain untouched by this PR: neither
  //     references the new builder module or calls
  //     createFixedEnvironmentBinding/buildGenerationZeroFixedEnvironment.
  const executorsPath = path.join(__dirname, "src", "p6", "p6-3-live-executors.ts");
  const executorsSource = fs.readFileSync(executorsPath, "utf8");
  assert.ok(
    !executorsSource.includes("generation-zero-fixed-environment"),
    "executeP63MCell/executeP63RSemCell must not import the Generation-0 builder in this PR"
  );
  assert.ok(
    !executorsSource.includes("buildGenerationZeroFixedEnvironment"),
    "P6-3 v2 executors must not call the Generation-0 builder in this PR"
  );
  assert.ok(
    !executorsSource.includes("createFixedEnvironmentBinding"),
    "P6-3 v2 executors must not call createFixedEnvironmentBinding directly"
  );
  const orchestratorSource = fs.readFileSync(
    path.join(__dirname, "src", "orchestrator.ts"),
    "utf8"
  );
  assert.ok(
    !orchestratorSource.includes("generation-zero-fixed-environment"),
    "orchestrator.ts must not import the Generation-0 builder in this PR"
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        slice: "p6-3-v3-generation-zero-fixed-environment-builder-pr-a",
        builderVersion: GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
        repositorySerializerVersion: GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
        bindingIdentity: fixedEnvironmentIdentity(binding),
        surfaceSpecVersion: binding.surfaceSpecVersion,
        modelVisibleTokens: binding.modelVisibleTokens,
        verified: [
          "build-succeeds-and-passes-assertFixedEnvironmentBinding",
          "sourceKind-is-generation-zero",
          "modelVisibleText-exactly-equals-FIXED_WORLD_PROTOCOL_SPEC-not-paraphrased",
          "canonical-token-count-matches-existing-token-counter",
          "repository-hash-reuses-existing-frozen-static-repository-serializer",
          "repository-hash-independent-of-file-insertion-order",
          "one-byte-repository-content-change-changes-hash-and-identity",
          "spec-text-change-changes-surface-hash-and-identity",
          "deterministic-identity-across-repeated-calls-same-input",
          "builder-source-makes-no-provider-call-and-reads-no-scientific-outcome-data",
          "p6-3-v2-M-Rsem-executors-and-orchestrator-untouched-by-this-PR",
        ],
      },
      null,
      2
    )
  );
}

main();
