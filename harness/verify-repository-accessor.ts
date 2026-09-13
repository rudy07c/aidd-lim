import assert from "assert";
import {
  DEFAULT_SEARCH_MAX_RESULTS,
  InMemoryRepositoryAccessor,
  MAX_SEARCH_RESULTS,
  REPOSITORY_ACCESSOR_SCHEMA_VERSION,
  REPOSITORY_ACCESS_STORAGE_MODE,
} from "./src/repository/repository-accessor";
import {
  countArtifactUnitWorkingSetTokens,
  serializeArtifactUnitForWorkingSet,
} from "./src/measurement/artifact-unit";

const VISIBLE_FILES: Record<string, string> = {
  "README.md": "Visible repository documentation.\n",
  "src/a.ts": "export const Alpha = 1;\nconst shared = 'needle';\n",
  "src/b.ts": "export const Beta = 2;\nconst shared = 'NEEDLE';\nconst tail = true;\n",
  "src/nested/c.ts": "export const Gamma = 'needle';\n",
  "empty.txt": "",
};

async function verifyDeterministicListing(): Promise<Record<string, unknown>> {
  const reverseInsertion: Record<string, string> = {};
  for (const key of Object.keys(VISIBLE_FILES).reverse()) {
    reverseInsertion[key] = VISIBLE_FILES[key];
  }
  const first = new InMemoryRepositoryAccessor(VISIBLE_FILES);
  const second = new InMemoryRepositoryAccessor(reverseInsertion);
  assert.strictEqual(
    first.snapshotHash,
    second.snapshotHash,
    "snapshot hash must not depend on caller object insertion order"
  );

  const rootA = await first.listFiles();
  const rootB = await first.listFiles();
  assert.deepStrictEqual(rootB, rootA, "same snapshot/list request must replay exactly");
  assert.strictEqual(rootA.schemaVersion, REPOSITORY_ACCESSOR_SCHEMA_VERSION);
  assert.strictEqual(rootA.operation, "list-files");
  assert.strictEqual(rootA.units.length, 1);
  assert.strictEqual(rootA.units[0].kind, "listing");
  assert.strictEqual(rootA.units[0].path, ".");
  assert.strictEqual(
    rootA.units[0].content,
    ["empty.txt", "README.md", "src/a.ts", "src/b.ts", "src/nested/c.ts"].join("\n")
  );
  assert.strictEqual(rootA.totalEvidenceTokens, rootA.units[0].tokenCount);
  assert.strictEqual(rootA.units[0].tokenCount, countArtifactUnitWorkingSetTokens(rootA.units[0]));

  const src = await first.listFiles({ directory: "src" });
  assert.strictEqual(
    src.units[0].content,
    ["src/a.ts", "src/b.ts", "src/nested/c.ts"].join("\n"),
    "directory listing is recursive and path-sorted"
  );
  assert.strictEqual(src.units[0].path, "src");

  return {
    snapshotHash: first.snapshotHash,
    rootResultHash: rootA.resultHash,
    rootFiles: rootA.units[0].content.split("\n"),
    srcFiles: src.units[0].content.split("\n"),
  };
}

async function verifyReadChunkAndDefensiveSnapshot(): Promise<Record<string, unknown>> {
  const mutableInput = { ...VISIBLE_FILES };
  const accessor = new InMemoryRepositoryAccessor(mutableInput);
  mutableInput["src/a.ts"] = "MUTATED AFTER CONSTRUCTION";
  mutableInput["new-after-construction.ts"] = "must not appear";

  const first = await accessor.readChunk({
    path: "src/a.ts",
    startLine: 1,
    endLine: 2,
  });
  assert.strictEqual(
    first.units[0].content,
    VISIBLE_FILES["src/a.ts"],
    "accessor must own a defensive snapshot"
  );
  assert.strictEqual(first.units[0].startLine, 1);
  assert.strictEqual(first.units[0].endLine, 2);
  assert.strictEqual(first.units[0].kind, "chunk");
  assert.strictEqual(first.totalEvidenceTokens, first.units[0].tokenCount);
  assert.strictEqual(
    first.units[0].tokenCount,
    countArtifactUnitWorkingSetTokens(first.units[0])
  );

  // Mutating a returned unit must not mutate the read-only repository snapshot.
  first.units[0].content = "CALLER MUTATION";
  const second = await accessor.readChunk({
    path: "src/a.ts",
    startLine: 1,
    endLine: 2,
  });
  assert.strictEqual(second.units[0].content, VISIBLE_FILES["src/a.ts"]);

  const empty = await accessor.readChunk({ path: "empty.txt" });
  assert.strictEqual(empty.units[0].content, "");
  assert.strictEqual(empty.units[0].startLine, 1);
  assert.strictEqual(empty.units[0].endLine, 1);

  await assert.rejects(
    () => accessor.readChunk({ path: "src/b.ts", startLine: 2, endLine: 4 }),
    /requested=L2-L4, totalLines=3/
  );
  await assert.rejects(
    () => accessor.readChunk({ path: "src/b.ts", startLine: 0, endLine: 1 }),
    /startLine must be a positive integer/
  );

  return {
    exactSourceSlicePreserved: true,
    callerMutationIsolated: true,
    emptyFileReadableAsLineOne: true,
    canonicalSerialization: serializeArtifactUnitForWorkingSet(second.units[0]),
  };
}

async function verifyDeterministicLiteralSearch(): Promise<Record<string, unknown>> {
  const accessor = new InMemoryRepositoryAccessor(VISIBLE_FILES);
  const all = await accessor.search({ query: "needle", maxResults: 10 });
  assert.strictEqual(all.operation, "search");
  assert.strictEqual(all.totalMatches, 3);
  assert.strictEqual(all.truncated, false);
  assert.deepStrictEqual(
    all.units.map((unit) => [unit.path, unit.startLine]),
    [
      ["src/a.ts", 2],
      ["src/b.ts", 2],
      ["src/nested/c.ts", 1],
    ],
    "search results must be deterministic path/line order"
  );
  assert.ok(all.units.every((unit) => unit.kind === "search-result"));
  assert.ok(
    all.units.every((unit) => unit.tokenCount === countArtifactUnitWorkingSetTokens(unit)),
    "search results must use canonical model-visible evidence accounting"
  );
  assert.strictEqual(
    all.totalEvidenceTokens,
    all.units.reduce((sum, unit) => sum + unit.tokenCount, 0)
  );

  const limited = await accessor.search({ query: "needle", maxResults: 2 });
  assert.strictEqual(limited.totalMatches, 3);
  assert.strictEqual(limited.units.length, 2);
  assert.strictEqual(limited.truncated, true);

  const defaulted = await accessor.search({ query: "export" });
  assert.ok(defaulted.units.length <= DEFAULT_SEARCH_MAX_RESULTS);

  await assert.rejects(() => accessor.search({ query: "   " }), /non-empty string/);
  await assert.rejects(
    () => accessor.search({ query: "x", maxResults: MAX_SEARCH_RESULTS + 1 }),
    /maxResults must be an integer between 1 and 100/
  );

  return {
    totalMatches: all.totalMatches,
    deterministicOrder: all.units.map((unit) => `${unit.path}:L${unit.startLine}`),
    truncatedAtTwo: limited.truncated,
    resultHash: all.resultHash,
  };
}

async function verifyReadIsolationAndPathGuards(): Promise<Record<string, unknown>> {
  const accessor = new InMemoryRepositoryAccessor(VISIBLE_FILES);
  const blockedRequests: string[] = [];

  const attempts: Array<{ label: string; run: () => Promise<unknown>; pattern: RegExp }> = [
    {
      label: "parent-traversal",
      run: () => accessor.readChunk({ path: "../ground_truth.json" }),
      pattern: /escapes root/,
    },
    {
      label: "normalized-escape",
      run: () => accessor.readChunk({ path: "src/../../heldout_tasks.json" }),
      pattern: /escapes root/,
    },
    {
      label: "absolute-posix",
      run: () => accessor.readChunk({ path: "/etc/passwd" }),
      pattern: /Absolute repository path is not allowed/,
    },
    {
      label: "absolute-windows",
      run: () => accessor.readChunk({ path: "C:\\secret\\file.txt" }),
      pattern: /Absolute repository path is not allowed/,
    },
    {
      label: "ground-truth-name",
      run: () => accessor.readChunk({ path: "ground_truth.json" }),
      pattern: /refused synthetic-world control\/evaluator path/,
    },
    {
      label: "heldout-task-name",
      run: () => accessor.readChunk({ path: "heldout_tasks.json" }),
      pattern: /refused synthetic-world control\/evaluator path/,
    },
    {
      label: "hidden-test-prefix",
      run: () => accessor.readChunk({ path: "hidden_regression_tests/H_G.test.ts" }),
      pattern: /refused synthetic-world control\/evaluator path/,
    },
    {
      label: "nonexistent-outside-alias",
      run: () => accessor.readChunk({ path: "synthetic-world/ground_truth.json" }),
      pattern: /not found in virtual root/,
    },
    {
      label: "list-parent",
      run: () => accessor.listFiles({ directory: "../hidden_regression_tests" }),
      pattern: /escapes root/,
    },
  ];

  for (const attempt of attempts) {
    await assert.rejects(attempt.run, attempt.pattern, attempt.label);
    blockedRequests.push(attempt.label);
  }

  assert.throws(
    () =>
      new InMemoryRepositoryAccessor({
        ...VISIBLE_FILES,
        "ground_truth.json": "must never enter repository snapshot",
      }),
    /refused synthetic-world control\/evaluator path/
  );
  assert.throws(
    () =>
      new InMemoryRepositoryAccessor({
        ...VISIBLE_FILES,
        "hidden_regression_tests/H_G.test.ts": "hidden",
      }),
    /refused synthetic-world control\/evaluator path/
  );
  assert.throws(
    () =>
      new InMemoryRepositoryAccessor({
        ...VISIBLE_FILES,
        "src/../ground_truth.json": "noncanonical alias",
      }),
    /Repository path is not canonical/
  );

  const root = await accessor.listFiles();
  const serializedListing = serializeArtifactUnitForWorkingSet(root.units[0]);
  for (const hiddenName of [
    "ground_truth.json",
    "heldout_tasks.json",
    "hidden_regression_tests",
  ]) {
    assert.ok(
      !serializedListing.includes(hiddenName),
      `virtual-root listing leaked hidden/control name: ${hiddenName}`
    );
  }

  return {
    storageMode: REPOSITORY_ACCESS_STORAGE_MODE,
    blockedRequests,
    wrongRootSnapshotFailsClosed: true,
    hiddenNamesAbsentFromListing: true,
    genericFilesystemFallbackPresent: false,
  };
}

async function main(): Promise<void> {
  const listing = await verifyDeterministicListing();
  const read = await verifyReadChunkAndDefensiveSnapshot();
  const search = await verifyDeterministicLiteralSearch();
  const isolation = await verifyReadIsolationAndPathGuards();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        p5Slice: "step-1-provider-neutral-repository-accessor",
        schemaVersion: REPOSITORY_ACCESSOR_SCHEMA_VERSION,
        storageMode: REPOSITORY_ACCESS_STORAGE_MODE,
        operations: ["list_files", "search", "read_file_chunk"],
        eMaxCoupling: "deferred-to-P5-controller-tool-boundary",
        workingSetCoupling: "returns-canonical-ArtifactUnits-only",
        listing,
        read,
        search,
        isolation,
        verified: [
          "readable-universe-is-defensive-in-memory-repository-snapshot",
          "no-filesystem-path-dereference-in-accessor",
          "repository-path-guard-applied-to-snapshot-and-path-requests",
          "known-synthetic-world-control-paths-fail-closed",
          "parent-and-absolute-read-escape-rejected",
          "wrong-root-hidden-data-injection-rejected",
          "root-and-directory-listing-deterministic",
          "literal-search-deterministic-and-bounded",
          "read-chunk-preserves-exact-source-slice",
          "all-returned-evidence-is-canonical-ArtifactUnit",
          "harness-side-result-metadata-not-free-model-evidence",
          "caller-cannot-mutate-accessor-snapshot-through-input-or-result",
        ],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
