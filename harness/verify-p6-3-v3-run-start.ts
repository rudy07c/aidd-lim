import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  buildGenerationZeroFixedEnvironment,
  GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
  GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
} from "./src/context/generation-zero-fixed-environment";
import {
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  type FixedEnvironmentBinding,
} from "./src/context/fixed-environment-runtime";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./src/p6/p6-3-live-calibration-runner";
import {
  initializeP63V3RunStart,
  P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA,
  P6_3_V3_RUN_START_WIRING_VERSION,
} from "./src/p6/p6-3-v3-run-start";

const historicalCliSource = fs.readFileSync(
  path.join(__dirname, "p6-3-live-calibration.ts"),
  "utf8"
);
const runStartSource = fs.readFileSync(
  path.join(__dirname, "src", "p6", "p6-3-v3-run-start.ts"),
  "utf8"
);

// 1. The v3 run-start slice is additive; historical v2 calibration wiring is untouched.
assert.ok(!historicalCliSource.includes("p6-3-v3-run-start"));
assert.ok(!historicalCliSource.includes("initializeP63V3RunStart"));
assert.ok(runStartSource.includes("initializeP63V3RunStart"));

const repositoryFiles = {
  "src/a.ts": "export const a = 1;\n",
  "tests/a.visible.test.ts": "export const expected = true;\n",
};
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

async function main(): Promise<void> {
  let builderCalls = 0;
  let persistenceCalls = 0;
  const receivedBindings: Readonly<FixedEnvironmentBinding>[] = [];
  const events: string[] = [];
  let persisted: any = null;

  const context = await initializeP63V3RunStart({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance: async (provenance) => {
        persistenceCalls += 1;
        persisted = provenance;
        events.push("persist");
      },
    },
    dependencies: {
      buildFixedEnvironment: (args) => {
        builderCalls += 1;
        events.push("build");
        return buildGenerationZeroFixedEnvironment(args);
      },
      executeMCell: async (args) => {
        events.push("M");
        receivedBindings.push(args.fixedEnvironment);
        return validOutcome(args.fixedEnvironment, args.exposure, "M");
      },
      executeRSemCell: async (args) => {
        events.push("Rsem");
        receivedBindings.push(args.fixedEnvironment);
        return validOutcome(args.fixedEnvironment, args.exposure, "Rsem");
      },
    },
  });

  // 2. Generation-0 E_fixed is built exactly once and provenance is persisted
  //    exactly once before any cell may execute.
  assert.equal(builderCalls, 1);
  assert.equal(persistenceCalls, 1);
  assert.deepEqual(events, ["build", "persist"]);
  assert(persisted);
  assert.equal(persisted.schemaVersion, P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA);
  assert.equal(persisted.wiringVersion, P6_3_V3_RUN_START_WIRING_VERSION);
  assert.equal(persisted.builderVersion, GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION);
  assert.equal(persisted.repositorySerializerVersion, GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION);
  assert.equal(persisted.fixedEnvironmentIdentity, fixedEnvironmentIdentity(context.fixedEnvironment));
  assert.deepEqual(persisted.fixedEnvironment, fixedEnvironmentLogSnapshot(context.fixedEnvironment));
  assert(Object.isFrozen(context.fixedEnvironment));
  assert(Object.isFrozen(context.provenance));

  // 3. M and Rsem closures receive the same exact binding object across cells.
  await context.executeMCell({
    contextFiles: repositoryFiles,
    evaluationRepository: repositoryFiles,
    syntheticWorldDir: "/offline/fixture",
    task: { taskId: "task-1", visibleInstruction: "fixture" },
    repeat: 1,
    contextBudget: 123,
    exposure,
  });
  await context.executeRSemCell({
    contextFiles: repositoryFiles,
    probes: [],
    repeat: 1,
    exposure,
  });
  await context.executeMCell({
    contextFiles: repositoryFiles,
    evaluationRepository: repositoryFiles,
    syntheticWorldDir: "/offline/fixture",
    task: { taskId: "task-1", visibleInstruction: "fixture" },
    repeat: 2,
    contextBudget: 123,
    exposure,
  });
  await context.executeRSemCell({
    contextFiles: repositoryFiles,
    probes: [],
    repeat: 2,
    exposure,
  });
  assert.equal(builderCalls, 1);
  assert.equal(persistenceCalls, 1);
  assert.equal(receivedBindings.length, 4);
  for (const binding of receivedBindings) {
    assert.strictEqual(binding, context.fixedEnvironment);
  }
  assert.deepEqual(events, ["build", "persist", "M", "Rsem", "M", "Rsem"]);

  // 4. A cell that reports a different diagnostic identity fails closed.
  const diagnosticDrift = await initializeP63V3RunStart({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: { persistRunFixedEnvironmentProvenance: () => undefined },
    dependencies: {
      executeMCell: async (args) => ({
        ...validOutcome(args.fixedEnvironment, args.exposure, "M"),
        diagnosticSummary: { fixedEnvironmentIdentity: "drifted-identity" },
      }),
      executeRSemCell: async (args) => validOutcome(args.fixedEnvironment, args.exposure, "Rsem"),
    },
  });
  await assert.rejects(
    () => diagnosticDrift.executeMCell({
      contextFiles: repositoryFiles,
      evaluationRepository: repositoryFiles,
      syntheticWorldDir: "/offline/fixture",
      task: { taskId: "task-1", visibleInstruction: "fixture" },
      repeat: 1,
      contextBudget: 123,
      exposure,
    }),
    /diagnostic identity drift/
  );

  // 5. Even with the right diagnostic identity, a different artifact snapshot
  //    also fails closed.
  const artifactDrift = await initializeP63V3RunStart({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: { persistRunFixedEnvironmentProvenance: () => undefined },
    dependencies: {
      executeMCell: async (args) => validOutcome(args.fixedEnvironment, args.exposure, "M"),
      executeRSemCell: async (args) => {
        const outcome = validOutcome(args.fixedEnvironment, args.exposure, "Rsem");
        const snapshot = fixedEnvironmentLogSnapshot(args.fixedEnvironment);
        return {
          ...outcome,
          artifactPayload: {
            fixedEnvironment: {
              ...snapshot,
              modelVisibleText: `${snapshot.modelVisibleText}\nDRIFT`,
            },
          },
        };
      },
    },
  });
  await assert.rejects(
    () => artifactDrift.executeRSemCell({
      contextFiles: repositoryFiles,
      probes: [],
      repeat: 1,
      exposure,
    }),
    /artifact snapshot drifted/
  );

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-run-start-wiring",
    wiringVersion: P6_3_V3_RUN_START_WIRING_VERSION,
    provenanceSchema: P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA,
    fixedEnvironmentIdentity: context.provenance.fixedEnvironmentIdentity,
    verified: [
      "historical-v2-calibration-cli-remains-unwired-to-v3",
      "generation-zero-binding-built-exactly-once-per-run-start",
      "run-fixed-provenance-persisted-before-cell-execution",
      "builder-and-repository-serializer-versions-persisted",
      "same-binding-object-fed-to-m-and-rsem-across-cells",
      "diagnostic-identity-drift-fails-closed",
      "artifact-snapshot-drift-fails-closed",
      "offline-verifier-makes-no-provider-call",
    ],
  }, null, 2));
}

function validOutcome(
  binding: Readonly<FixedEnvironmentBinding>,
  cellExposure: P63ExposureEvidence,
  measurement: "M" | "Rsem"
): P63CellOutcome {
  const identity = fixedEnvironmentIdentity(binding);
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: measurement === "M" ? true : null,
    semanticScore: 1,
    protocolValid: true,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: cellExposure,
    diagnosticSummary: {
      fixedEnvironmentIdentity: identity,
      measurement,
    },
    artifactPayload: {
      fixedEnvironment: fixedEnvironmentLogSnapshot(binding),
      measurement,
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
