import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { buildP63CalibrationPlan } from "./src/p6/p6-3-live-calibration-runner";
import {
  createP63V2CalibrationState,
  executeP63V2Calibration,
  type P63V2CalibrationPersistence,
} from "./src/p6/p6-3-v2-live-calibration-runner";
import {
  P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA,
  P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE,
  classifyP63V2MaxOutputCensoring,
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
  verifyCensoringClassifierBoundaries();
  const summary = await verifyTerminalCollectionSummary();
  await verifyUnclassifiableIncompleteState();
  await verifyInterruptedAttemptVisibility();
  await verifyWrapperFailsOnTelemetryEvidenceMismatch();
  verifyArtifactIdentityBinding(summary);
  verifyV1ExploratoryRegression();

  console.log(JSON.stringify({
    ok: true,
    committedAttempts: summary.committedAttemptCount,
    classifiableAttempts: summary.maxOutputCensoringClassifiableAttemptCount,
    unclassifiableAttempts: summary.maxOutputCensoringUnclassifiableAttemptCount,
    maxOutputCensoredAttempts: summary.maxOutputCensoredAttemptCount,
    exhaustedCells: summary.exhaustedCellLocations.length,
    quantileRule: summary.quantileRule,
    triStateCensoring: true,
    interruptedAttemptsVisible: true,
  }));
}

function verifyCensoringClassifierBoundaries(): void {
  assert.equal(classifyP63V2MaxOutputCensoring({
    executionStatus: "response-incomplete",
    incompleteReason: "max_output_tokens",
  }), true);
  assert.equal(classifyP63V2MaxOutputCensoring({
    executionStatus: "response-incomplete",
    incompleteReason: "content_filter",
  }), false);
  assert.equal(classifyP63V2MaxOutputCensoring({
    executionStatus: "response-incomplete",
    incompleteReason: null,
  }), null);
  assert.equal(classifyP63V2MaxOutputCensoring({
    executionStatus: "ok",
    incompleteReason: null,
  }), false);
  assert.equal(classifyP63V2MaxOutputCensoring({
    executionStatus: "ok",
    incompleteReason: "max_output_tokens",
  }), null);
}

async function verifyTerminalCollectionSummary() {
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
    loadAttemptArtifact: (artifactPath) => requiredArtifact(persistence, artifactPath),
  });

  assert.equal(summary.collectionStatus, "needs-design-audit");
  assert.equal(summary.quantileRule, P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE);
  assert.deepEqual(summary.secondaryEndpointIds, [...P6_3_V2_SECONDARY_ENDPOINT_IDS]);
  assert.deepEqual(summary.secondarySummaryIds, [...P6_3_V2_SECONDARY_SUMMARY_IDS]);
  assert.equal(summary.committedAttemptCount, 6);
  assert.equal(summary.interruptedAttemptCount, 0);
  assert.equal(summary.providerVisibleAttemptCount, 6);
  assert.equal(summary.maxOutputCensoredAttemptCount, 4);
  assert.equal(summary.maxOutputCensoringClassifiableAttemptCount, 6);
  assert.equal(summary.maxOutputCensoringUnclassifiableAttemptCount, 0);
  assert.deepEqual(
    summary.logicalCells.map((cell) => ({
      sequence: cell.sequence,
      committed: cell.committedAttemptCount,
      interrupted: cell.interruptedAttemptCount,
      attempts: cell.attemptCount,
      anyCensoring: cell.anyMaxOutputCensoring,
      attemptsToValid: cell.attemptsToValidScientificObservation,
      exhausted: cell.censoredExhausted,
    })),
    [
      { sequence: 0, committed: 2, interrupted: 0, attempts: 2, anyCensoring: true, attemptsToValid: 2, exhausted: false },
      { sequence: 1, committed: 3, interrupted: 0, attempts: 3, anyCensoring: true, attemptsToValid: null, exhausted: true },
      { sequence: 2, committed: 1, interrupted: 0, attempts: 1, anyCensoring: false, attemptsToValid: 1, exhausted: false },
    ]
  );

  const b0 = summary.byArm.find((item) => item.armLabel === "B0");
  const b1 = summary.byArm.find((item) => item.armLabel === "B1");
  const b2 = summary.byArm.find((item) => item.armLabel === "B2");
  assert.ok(b0 && b1 && b2);
  assert.deepEqual(
    pick(b0, [
      "committedAttempts",
      "interruptedAttempts",
      "providerVisibleAttempts",
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
      committedAttempts: 2,
      interruptedAttempts: 0,
      providerVisibleAttempts: 2,
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
  assert.equal(b1.committedAttempts, 3);
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

  (summary as any).__testPersistence = persistence;
  (summary as any).__testState = state;
  return summary;
}

async function verifyUnclassifiableIncompleteState(): Promise<void> {
  const oneCellPlan = plan.slice(0, 1);
  const state = createP63V2CalibrationState({
    checkoutGitSha: "offline-unclassifiable",
    frozenManifestHashes: { executionParameters: "offline-test" },
    plan: oneCellPlan,
    executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
  });
  const persistence = memoryPersistence();
  const executor = withP63V2SecondaryReliability({
    execute: async (cell, attempt): Promise<P63V2ReliabilityCellOutcome> => ({
      failureDomain: "infrastructure",
      executionStatus: "response-incomplete",
      passed: false,
      semanticScore: 0,
      protocolValid: null,
      estimatedCostUsd: 0,
      failureReason: "response incomplete without provider reason",
      exposure: exposure(cell),
      diagnosticSummary: {},
      artifactPayload: { scientific: "unknown-incomplete", sequence: cell.sequence, attempt },
      autoInfrastructureEvidence: {
        executionStatus: "response-incomplete",
        incompleteReason: null,
        outputTokens: 14000,
        configuredMaxOutputTokens: 14000,
        responseStatus: "incomplete",
        providerErrorCode: null,
        errorCategory: "response",
      },
      reliabilityTelemetry: {
        tokenUsage: { input: 100, output: 14000, reasoningOutput: 13000, total: 14100 },
        configuredMaxOutputTokens: 14000,
        incompleteReason: null,
      },
    }),
  });
  await executeP63V2Calibration(
    state,
    {
      checkoutGitSha: "offline-unclassifiable",
      frozenManifestHashes: { executionParameters: "offline-test" },
      executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
    },
    oneCellPlan,
    executor,
    persistence
  );
  assert.equal(state.status, "needs-audit");
  const summary = summarizeP63V2SecondaryReliability({
    state,
    plan: oneCellPlan,
    loadAttemptArtifact: (artifactPath) => requiredArtifact(persistence, artifactPath),
  });
  assert.equal(summary.committedAttemptCount, 1);
  assert.equal(summary.maxOutputCensoringClassifiableAttemptCount, 0);
  assert.equal(summary.maxOutputCensoringUnclassifiableAttemptCount, 1);
  assert.equal(summary.attempts[0]?.maxOutputCensored, null);
  assert.equal(summary.logicalCells[0]?.anyMaxOutputCensoring, null);
  const b0 = summary.byArm.find((item) => item.armLabel === "B0")!;
  assert.equal(b0.attemptCensoringRate, null);
  assert.equal(b0.censoringClassifiableAttempts, 0);
  assert.equal(b0.censoringUnclassifiableAttempts, 1);
  assert.equal(b0.logicalCellCensoringRate, null);
  assert.equal(b0.censoringUnclassifiableLogicalCells, 1);
}

async function verifyInterruptedAttemptVisibility(): Promise<void> {
  const oneCellPlan = plan.slice(0, 1);
  const state = createP63V2CalibrationState({
    checkoutGitSha: "offline-interrupted",
    frozenManifestHashes: { executionParameters: "offline-test" },
    plan: oneCellPlan,
    executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
  });
  state.inFlight = {
    sequence: 0,
    attempt: 1,
    startedAt: "2026-09-27T00:00:00.000Z",
  };
  let called = false;
  const persistence = memoryPersistence();
  await executeP63V2Calibration(
    state,
    {
      checkoutGitSha: "offline-interrupted",
      frozenManifestHashes: { executionParameters: "offline-test" },
      executionPolicy: { maxScientificAttemptsPerLogicalCell: 3 },
    },
    oneCellPlan,
    { execute: async () => { called = true; throw new Error("must not execute"); } },
    persistence
  );
  assert.equal(called, false);
  assert.equal(state.status, "needs-audit");
  assert.equal(state.interruptedAttempts.length, 1);
  const summary = summarizeP63V2SecondaryReliability({
    state,
    plan: oneCellPlan,
    loadAttemptArtifact: () => { throw new Error("no committed artifact expected"); },
  });
  assert.equal(summary.committedAttemptCount, 0);
  assert.equal(summary.interruptedAttemptCount, 1);
  assert.equal(summary.providerVisibleAttemptCount, 1);
  assert.equal(summary.maxOutputCensoringClassifiableAttemptCount, 0);
  assert.equal(summary.maxOutputCensoringUnclassifiableAttemptCount, 1);
  assert.equal(summary.interruptedAttemptLocations[0]?.sequence, 0);
  assert.equal(summary.logicalCells[0]?.attemptCount, 1);
  assert.equal(summary.logicalCells[0]?.interruptedAttemptCount, 1);
  assert.equal(summary.logicalCells[0]?.anyMaxOutputCensoring, null);
  const b0 = summary.byArm.find((item) => item.armLabel === "B0")!;
  assert.equal(b0.providerVisibleAttempts, 1);
  assert.equal(b0.censoringUnclassifiableAttempts, 1);
  assert.equal(b0.outputTokens.observed, 0);
  assert.equal(b0.outputTokens.missing, 1);
}

async function verifyWrapperFailsOnTelemetryEvidenceMismatch(): Promise<void> {
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
}

function verifyArtifactIdentityBinding(summary: any): void {
  const persistence = summary.__testPersistence as ReturnType<typeof memoryPersistence>;
  const state = summary.__testState as ReturnType<typeof createP63V2CalibrationState>;
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
      loadAttemptArtifact: (artifactPath) => requiredArtifact(persistence, artifactPath),
    }),
    /artifact identity mismatch/
  );
  persistence.artifacts.set(firstPath!, original);
}

function verifyV1ExploratoryRegression(): void {
  const fixturePath = path.resolve(__dirname, "frozen/p6-3-v1-auto-infra-regression.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    summary: { attemptCount: number; humanInfrastructureInvalidCount: number };
    cases: Array<{ rawEvidence: { executionStatus: string; incompleteReason: string | null } }>;
  };
  assert.equal(fixture.summary.attemptCount, 43);
  assert.equal(fixture.cases.length, 43);
  const classified = fixture.cases.map((item) => classifyP63V2MaxOutputCensoring(item.rawEvidence));
  assert.equal(classified.filter((value) => value === true).length, 11);
  assert.equal(classified.filter((value) => value === true).length, fixture.summary.humanInfrastructureInvalidCount);
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

function requiredArtifact(persistence: ReturnType<typeof memoryPersistence>, artifactPath: string): unknown {
  if (!persistence.artifacts.has(artifactPath)) throw new Error(`missing ${artifactPath}`);
  return persistence.artifacts.get(artifactPath);
}

function pick<T extends object>(value: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [String(key), value[key]]));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
