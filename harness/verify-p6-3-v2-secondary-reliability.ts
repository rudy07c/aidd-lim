import * as assert from "assert";
import { buildP63CalibrationPlan } from "./src/p6/p6-3-live-calibration-runner";
import {
  createP63V2CalibrationState,
  executeP63V2Calibration,
  type P63V2CalibrationPersistence,
} from "./src/p6/p6-3-v2-live-calibration-runner";
import {
  P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA,
  P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE,
  summarizeP63V2SecondaryReliability,
  withP63V2SecondaryReliability,
  type P63V2ReliabilityCellOutcome,
} from "./src/p6/p6-3-v2-secondary-reliability";
import {
  P6_3_V2_MUTATION_PROVIDER_CONTRACT,
  P6_3_V2_SECONDARY_ENDPOINT_IDS,
  P6_3_V2_SECONDARY_SUMMARY_IDS,
} from "./src/p6/p6-3-v2-execution-parameters";

const fullPlan = buildP63CalibrationPlan({
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
});
const plan = fullPlan.slice(0, 3);
assert.deepEqual(plan.map((cell) => cell.arm.label), ["B0", "B1", "B2"]);

async function main(): Promise<void> {
  const state = createP63V2CalibrationState({
    checkoutGitSha: "offline-v2-secondary-reliability-sha",
    frozenManifestHashes: { executionParameters: "offline-test" },
    plan,
    executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
  });
  const persistence = memoryPersistence();
  const executor = withP63V2SecondaryReliability({
    execute: async (cell, attempt): Promise<P63V2ReliabilityCellOutcome> => {
      if (cell.sequence === 0 && attempt === 1) return censoredOutcome(cell, attempt, 13000);
      if (cell.sequence === 1) return censoredOutcome(cell, attempt, 12000 + attempt);
      if (cell.sequence === 0) return successOutcome(cell, attempt, 111, 21);
      return successOutcome(cell, attempt, 400, null);
    },
  });

  await executeP63V2Calibration(
    state,
    {
      checkoutGitSha: "offline-v2-secondary-reliability-sha",
      frozenManifestHashes: { executionParameters: "offline-test" },
      executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
    },
    plan,
    executor,
    persistence
  );

  assert.equal(state.status, "needs-design-audit");
  assert.equal(state.attempts.length, 6);
  assert.equal(state.exhaustedCells.length, 1);
  assert.equal(state.exhaustedCells[0]?.sequence, 1);
  assert.equal(persistence.artifacts.size, 6);

  for (const payload of persistence.artifacts.values()) {
    assert.equal(
      (payload as { schemaVersion?: string }).schemaVersion,
      P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA
    );
  }

  const summary = summarizeP63V2SecondaryReliability({
    state,
    plan,
    loadAttemptArtifact: (artifactPath) => {
      if (!persistence.artifacts.has(artifactPath)) throw new Error(`missing ${artifactPath}`);
      return persistence.artifacts.get(artifactPath);
    },
  });

  assert.equal(summary.collectionStatus, "needs-design-audit");
  assert.equal(summary.quantileRule, P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE);
  assert.deepEqual(summary.secondaryEndpointIds, [...P6_3_V2_SECONDARY_ENDPOINT_IDS]);
  assert.deepEqual(summary.secondarySummaryIds, [...P6_3_V2_SECONDARY_SUMMARY_IDS]);
  assert.equal(summary.committedAttemptCount, 6);
  assert.equal(summary.interruptedAttemptCount, 0);
  assert.equal(summary.maxOutputCensoredAttemptCount, 4);
  assert.equal(summary.censoringUnclassifiableAttemptCount, 0);
  assert.deepEqual(
    summary.logicalCells.map((cell) => ({
      sequence: cell.sequence,
      attempts: cell.attemptCount,
      anyCensoring: cell.anyMaxOutputCensoring,
      attemptsToValid: cell.attemptsToValidScientificObservation,
      exhausted: cell.censoredExhausted,
    })),
    [
      { sequence: 0, attempts: 2, anyCensoring: true, attemptsToValid: 2, exhausted: false },
      { sequence: 1, attempts: 3, anyCensoring: true, attemptsToValid: null, exhausted: true },
      { sequence: 2, attempts: 1, anyCensoring: false, attemptsToValid: 1, exhausted: false },
    ]
  );

  const b0 = summary.byArm.find((item) => item.armLabel === "B0");
  const b1 = summary.byArm.find((item) => item.armLabel === "B1");
  const b2 = summary.byArm.find((item) => item.armLabel === "B2");
  assert.ok(b0 && b1 && b2);
  assert.deepEqual(
    pick(b0, [
      "attempts",
      "censoringClassifiableAttempts",
      "censoringUnclassifiableAttempts",
      "maxOutputCensoredAttempts",
      "attemptCensoringRate",
      "attemptedLogicalCells",
      "censoringClassifiableLogicalCells",
      "censoringUnclassifiableLogicalCells",
      "logicalCellsWithAnyCensoring",
      "logicalCellCensoringRate",
    ]),
    {
      attempts: 2,
      censoringClassifiableAttempts: 2,
      censoringUnclassifiableAttempts: 0,
      maxOutputCensoredAttempts: 1,
      attemptCensoringRate: 0.5,
      attemptedLogicalCells: 1,
      censoringClassifiableLogicalCells: 1,
      censoringUnclassifiableLogicalCells: 0,
      logicalCellsWithAnyCensoring: 1,
      logicalCellCensoringRate: 1,
    }
  );
  assert.deepEqual(b0.attemptCountDistribution.rawSorted, [2]);
  assert.deepEqual(b0.attemptsToValidScientificObservation.rawSorted, [2]);
  assert.deepEqual(b0.outputTokens.rawSorted, [111, 14000]);
  assert.equal(b0.outputTokens.q25, 111);
  assert.equal(b0.outputTokens.q50, 111);
  assert.equal(b0.outputTokens.q75, 14000);
  assert.equal(b1.attempts, 3);
  assert.equal(b1.censoringClassifiableAttempts, 3);
  assert.equal(b1.maxOutputCensoredAttempts, 3);
  assert.equal(b1.attemptCensoringRate, 1);
  assert.equal(b1.attemptsToValidScientificObservation.observed, 0);
  assert.equal(b1.attemptsToValidScientificObservation.missing, 1);
  assert.equal(b2.reasoningOutputTokens.observed, 0);
  assert.equal(b2.reasoningOutputTokens.missing, 1);

  assert.deepEqual(summary.exhaustedCellLocations, [{
    sequence: 1,
    measurement: plan[1].measurement,
    taskId: plan[1].taskId,
    repeat: plan[1].repeat,
    armLabel: "B1",
    attempts: 3,
  }]);

  const seq0Attempt1 = summary.attempts.find((row) => row.sequence === 0 && row.attempt === 1);
  assert.equal(seq0Attempt1?.maxOutputCensored, true);
  assert.equal(seq0Attempt1?.configuredMaxOutputTokens, 14000);
  assert.equal(seq0Attempt1?.outputTokens, 14000);
  assert.equal(seq0Attempt1?.reasoningOutputTokens, 13000);

  // Missing provider reason is not silently treated as a negative censoring observation.
  const ambiguousState: any = JSON.parse(JSON.stringify(state));
  ambiguousState.status = "needs-audit";
  const ambiguousRecord = ambiguousState.attempts.find(
    (row: any) => row.sequence === 2 && row.attempt === 1
  );
  assert.ok(ambiguousRecord);
  ambiguousRecord.executionStatus = "response-incomplete";
  ambiguousRecord.rawFailureDomain = "infrastructure";
  ambiguousRecord.effectiveFailureDomain = "infrastructure";
  const ambiguousSummary = summarizeP63V2SecondaryReliability({
    state: ambiguousState,
    plan,
    loadAttemptArtifact: (artifactPath) => persistence.artifacts.get(artifactPath),
  });
  const ambiguousB2 = ambiguousSummary.byArm.find((item) => item.armLabel === "B2");
  assert.ok(ambiguousB2);
  assert.equal(ambiguousSummary.censoringUnclassifiableAttemptCount, 1);
  assert.equal(ambiguousB2.censoringClassifiableAttempts, 0);
  assert.equal(ambiguousB2.censoringUnclassifiableAttempts, 1);
  assert.equal(ambiguousB2.attemptCensoringRate, null);
  assert.equal(ambiguousB2.censoringClassifiableLogicalCells, 0);
  assert.equal(ambiguousB2.censoringUnclassifiableLogicalCells, 1);
  assert.equal(ambiguousB2.logicalCellCensoringRate, null);
  assert.equal(
    ambiguousSummary.logicalCells.find((cell) => cell.sequence === 2)?.anyMaxOutputCensoring,
    null
  );

  await assert.rejects(
    () => withP63V2SecondaryReliability({
      execute: async (cell, attempt) => ({
        ...censoredOutcome(cell, attempt, 13000),
        reliabilityTelemetry: {
          tokenUsage: { input: 100, output: 13999, reasoningOutput: 13000, total: 14099 },
          configuredMaxOutputTokens: 14000,
          incompleteReason: "max_output_tokens",
        },
      }),
    }).execute(plan[0], 1),
    /disagrees with automatic-infrastructure raw evidence/
  );

  const firstPath = state.attempts[0]?.artifactPath;
  assert.ok(firstPath);
  const original = persistence.artifacts.get(firstPath!);
  assert.ok(original);
  persistence.artifacts.set(firstPath!, {
    ...(original as object),
    identity: {
      ...((original as any).identity as object),
      attempt: 99,
    },
  });
  assert.throws(
    () => summarizeP63V2SecondaryReliability({
      state,
      plan,
      loadAttemptArtifact: (artifactPath) => persistence.artifacts.get(artifactPath),
    }),
    /artifact identity mismatch/
  );
  persistence.artifacts.set(firstPath!, original);

  const missingFieldOutcome = successOutcome(plan[2], 1, 10, null) as any;
  delete missingFieldOutcome.reliabilityTelemetry.tokenUsage.reasoningOutput;
  await assert.rejects(
    () => withP63V2SecondaryReliability({
      execute: async () => missingFieldOutcome,
    }).execute(plan[2], 1),
    /missing required token field reasoningOutput/
  );

  console.log(JSON.stringify({
    ok: true,
    committedAttempts: summary.committedAttemptCount,
    maxOutputCensoredAttempts: summary.maxOutputCensoredAttemptCount,
    unclassifiableCensoringRegression: 1,
    exhaustedCells: summary.exhaustedCellLocations.length,
    quantileRule: summary.quantileRule,
    allAttemptArtifactsBound: persistence.artifacts.size,
  }));
}

function censoredOutcome(
  cell: (typeof plan)[number],
  attempt: number,
  reasoningOutput: number
): P63V2ReliabilityCellOutcome {
  const maxOutputTokens = P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens;
  return {
    failureDomain: "infrastructure",
    executionStatus: "response-incomplete",
    passed: false,
    semanticScore: 0,
    protocolValid: null,
    estimatedCostUsd: 0,
    failureReason: "Response status=incomplete reason=max_output_tokens",
    exposure: exposure(cell),
    diagnosticSummary: {},
    artifactPayload: { scientific: "censored", sequence: cell.sequence, attempt },
    autoInfrastructureEvidence: {
      executionStatus: "response-incomplete",
      incompleteReason: "max_output_tokens",
      outputTokens: maxOutputTokens,
      configuredMaxOutputTokens: maxOutputTokens,
      responseStatus: "incomplete",
      providerErrorCode: null,
      errorCategory: "response",
    },
    reliabilityTelemetry: {
      tokenUsage: {
        input: 100 + cell.sequence,
        output: maxOutputTokens,
        reasoningOutput,
        total: maxOutputTokens + 100 + cell.sequence,
      },
      configuredMaxOutputTokens: maxOutputTokens,
      incompleteReason: "max_output_tokens",
    },
  };
}

function successOutcome(
  cell: (typeof plan)[number],
  attempt: number,
  outputTokens: number,
  reasoningOutput: number | null
): P63V2ReliabilityCellOutcome {
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: cell.measurement === "M" ? true : null,
    semanticScore: 1,
    protocolValid: true,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: exposure(cell),
    diagnosticSummary: {},
    artifactPayload: { scientific: "success", sequence: cell.sequence, attempt },
    autoInfrastructureEvidence: null,
    reliabilityTelemetry: {
      tokenUsage: {
        input: 200 + cell.sequence,
        output: outputTokens,
        reasoningOutput,
        total: outputTokens + 200 + cell.sequence,
      },
      configuredMaxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
      incompleteReason: null,
    },
  };
}

function exposure(cell: (typeof plan)[number]) {
  return {
    mode: cell.arm.kind === "AF" ? "AF-full" as const : "EL-static" as const,
    budgetTokens: cell.budgetTokens,
    actualExposedTokens: cell.arm.kind === "AF" ? 4046 : Number(cell.budgetTokens),
    fullRepositoryTokens: 4046,
    staticPayloadHash: `secondary-${cell.sequence}`,
    exposureSetHash: cell.arm.kind === "AF" ? null : `secondary-set-${cell.sequence}`,
    selectorPlanHash: cell.arm.kind === "AF" ? null : `secondary-plan-${cell.sequence}`,
    selectedUnitCount: cell.arm.kind === "AF" ? null : 1,
  };
}

function memoryPersistence(): P63V2CalibrationPersistence & {
  artifacts: Map<string, unknown>;
} {
  const artifacts = new Map<string, unknown>();
  return {
    artifacts,
    persistState: () => undefined,
    persistAttemptArtifact: (cell, attempt, payload) => {
      const artifactPath = `attempts/${cell.sequence}-${attempt}.json`;
      artifacts.set(artifactPath, payload);
      return artifactPath;
    },
  };
}

function pick<T extends object>(value: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [String(key), value[key]]));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
