import assert from "assert";
import * as path from "path";
import {
  loadDirRecursive,
} from "./p6-af-baseline-live";
import {
  applyP63V3RSemCompletionAdjudication,
  authorizeP63V3RSemCompletionInvocation,
  createP63V3RSemCompletionState,
  executeP63V3ControlledRSemCompletion,
  recoverInterruptedP63V3RSemCompletionState,
  summarizeP63V3RSemCompletionState,
  P6_3_V3_RSEM_COMPLETION_PAID_ENV,
  type P63V3RSemCompletionPersistence,
} from "./src/p6/p6-3-v3-rsem-completion-controller";
import {
  prepareP63V3RSemCompletionRun,
} from "./src/p6/p6-3-v3-rsem-completion-runner";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./src/p6/p6-3-live-calibration-runner";
import type {
  P63V3RSemCompletionCell,
} from "./src/p6/p6-3-v3-rsem-completion-plan";

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const repositoryFiles: Record<string, string> = {};
  const repositoryDir = path.join(
    repoRoot,
    "synthetic-world",
    "repository"
  );
  loadDirRecursive(
    repositoryDir,
    repositoryDir,
    repositoryFiles
  );

  const prepared = await prepareP63V3RSemCompletionRun({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance() {},
      persistRSemCompletionTreatmentProvenance() {},
    },
  });

  const authorization =
    authorizeP63V3RSemCompletionInvocation({
      live: true,
      paidAuthorization: true,
      environment: {
        [P6_3_V3_RSEM_COMPLETION_PAID_ENV]: "1",
      } as NodeJS.ProcessEnv,
      checkoutGitSha: "a".repeat(40),
      prepared,
    });

  const artifacts: string[] = [];
  let persistedStates = 0;
  const persistence: P63V3RSemCompletionPersistence = {
    persistState() {
      persistedStates += 1;
    },
    persistAttemptArtifact(cell, attempt) {
      const target =
        `attempts/${String(cell.collectionSequence).padStart(2, "0")}-canonical-${cell.canonicalV3Sequence}-attempt-${attempt}.json`;
      artifacts.push(target);
      return target;
    },
  };

  let validCalls = 0;
  const state = createP63V3RSemCompletionState({
    prepared,
    authorization,
    now: "2026-10-03T00:00:00.000Z",
  });
  await executeP63V3ControlledRSemCompletion({
    state,
    prepared,
    authorization,
    persistence,
    executor: {
      execute: async (cell) => {
        validCalls += 1;
        return validOutcome(cell);
      },
    },
  });

  assert.equal(state.status, "completed");
  assert.equal(state.cursorCollectionSequence, 72);
  assert.equal(state.attempts.length, 72);
  assert.equal(validCalls, 72);
  assert.equal(artifacts.length, 72);
  assert.equal(state.attempts[0].collectionSequence, 0);
  assert.equal(state.attempts[0].canonicalV3Sequence, 792);
  assert.equal(state.attempts[71].collectionSequence, 71);
  assert.equal(state.attempts[71].canonicalV3Sequence, 863);
  assert.equal(
    state.attempts.every(
      (item) =>
        item.canonicalV3Sequence ===
        792 + item.collectionSequence
    ),
    true
  );

  const beforeReplayCalls = validCalls;
  await executeP63V3ControlledRSemCompletion({
    state,
    prepared,
    authorization,
    persistence,
    executor: {
      execute: async (cell) => {
        validCalls += 1;
        return validOutcome(cell);
      },
    },
  });
  assert.equal(validCalls, beforeReplayCalls);

  const tampered = {
    ...state,
    planHash: "b".repeat(64),
  } as any;
  await assert.rejects(
    () =>
      executeP63V3ControlledRSemCompletion({
        state: tampered,
        prepared,
        authorization,
        persistence,
        executor: {
          execute: async (cell) => validOutcome(cell),
        },
      }),
    /provenance changed|plan changed/
  );

  const interrupted =
    createP63V3RSemCompletionState({
      prepared,
      authorization,
    });
  interrupted.inFlight = {
    collectionSequence: 0,
    canonicalV3Sequence: 792,
    attempt: 1,
    startedAt: "2026-10-03T00:01:00.000Z",
  };
  recoverInterruptedP63V3RSemCompletionState(interrupted);
  assert.equal(interrupted.status, "needs-audit");
  assert.equal(interrupted.interruptedAttempts.length, 1);
  assert.equal(
    interrupted.auditFlag?.kind,
    "uncertain-in-flight-attempt"
  );
  applyP63V3RSemCompletionAdjudication({
    state: interrupted,
    prepared,
    request: {
      collectionSequence: 0,
      attempt: 1,
      reviewer: "offline-verifier",
      reason: "simulated interrupted provider-visible call",
      finalDisposition: "infrastructure-invalid",
      adjudicatedAt: "2026-10-03T00:02:00.000Z",
    },
  });
  assert.equal(interrupted.status, "running");
  assert.equal(interrupted.nextAttempt, 2);
  assert.equal(interrupted.cursorCollectionSequence, 0);

  let replacementCalls = 0;
  await executeP63V3ControlledRSemCompletion({
    state: interrupted,
    prepared,
    authorization,
    persistence: {
      persistState() {},
      persistAttemptArtifact(cell, attempt) {
        return `replacement/${cell.collectionSequence}-${attempt}.json`;
      },
    },
    executor: {
      execute: async (cell) => {
        replacementCalls += 1;
        return validOutcome(cell);
      },
    },
  });
  assert.equal(interrupted.status, "completed");
  assert.equal(replacementCalls, 72);
  assert.equal(interrupted.attempts[0].attempt, 2);
  assert.equal(interrupted.attempts[0].canonicalV3Sequence, 792);

  const exhausted =
    createP63V3RSemCompletionState({
      prepared,
      authorization,
    });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await executeP63V3ControlledRSemCompletion({
      state: exhausted,
      prepared,
      authorization,
      persistence: {
        persistState() {},
        persistAttemptArtifact(cell, currentAttempt) {
          return `infra/${cell.collectionSequence}-${currentAttempt}.json`;
        },
      },
      executor: {
        execute: async (cell) =>
          infrastructureInvalidOutcome(cell),
      },
    });
    assert.equal(exhausted.status, "needs-audit");
    applyP63V3RSemCompletionAdjudication({
      state: exhausted,
      prepared,
      request: {
        collectionSequence: 0,
        attempt,
        reviewer: "offline-verifier",
        reason: `simulated infrastructure invalid attempt ${attempt}`,
        finalDisposition: "infrastructure-invalid",
        adjudicatedAt:
          `2026-10-03T00:0${attempt + 2}:00.000Z`,
      },
    });
    if (attempt < 3) {
      assert.equal(exhausted.status, "running");
      assert.equal(exhausted.nextAttempt, attempt + 1);
    }
  }
  assert.equal(exhausted.status, "needs-audit");
  assert.equal(
    exhausted.auditFlag?.kind,
    "max-infrastructure-attempts-exhausted"
  );
  assert.equal(exhausted.attempts.length, 3);
  await assert.rejects(
    async () => {
      applyP63V3RSemCompletionAdjudication({
        state: exhausted,
        prepared,
        request: {
          collectionSequence: 0,
          attempt: 3,
          reviewer: "offline-verifier",
          reason: "attempt four must remain impossible",
          finalDisposition: "infrastructure-invalid",
        },
      });
    },
    /attempt ceiling is exhausted/
  );

  const summary =
    summarizeP63V3RSemCompletionState(state);
  assert.equal(summary.logicalCellsCompleted, 72);
  assert.equal(summary.nextCanonicalV3Sequence, null);
  assert.equal(persistedStates > 72, true);

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-completion-controller",
    providerCallsMade: false,
    validCompletion: {
      logicalCells: state.cursorCollectionSequence,
      attempts: state.attempts.length,
      canonicalRange: [
        state.attempts[0].canonicalV3Sequence,
        state.attempts[71].canonicalV3Sequence,
      ],
    },
    interruptionRecovery: {
      interruptedAttempts:
        interrupted.interruptedAttempts.length,
      replacementFirstAttempt:
        interrupted.attempts[0].attempt,
    },
    exhaustedInfrastructure: {
      attempts: exhausted.attempts.length,
      flag: exhausted.auditFlag?.kind,
    },
    verified: [
      "exactly-72-fresh-rsem-cells",
      "collection-sequence-0-71-maps-to-canonical-792-863",
      "completed-resume-makes-zero-new-calls",
      "resume-provenance-drift-fails-closed",
      "in-flight-attempt-is-never-blindly-replayed",
      "explicit-infrastructure-adjudication-required-before-replacement",
      "three-attempt-ceiling-prevents-attempt-four",
      "provider-free-controller-verification",
    ],
  }, null, 2));
}

function validOutcome(
  cell: Readonly<P63V3RSemCompletionCell>
): P63CellOutcome {
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: null,
    semanticScore: 0.5,
    protocolValid: true,
    estimatedCostUsd: 0.01,
    failureReason: null,
    exposure: exposureFor(cell),
    diagnosticSummary: {
      validity: "valid",
      fixedEnvironmentIdentity: "offline-fixture",
    },
    artifactPayload: {
      result: {
        validity: "valid",
      },
    },
  };
}

function infrastructureInvalidOutcome(
  cell: Readonly<P63V3RSemCompletionCell>
): P63CellOutcome {
  return {
    failureDomain: "infrastructure",
    executionStatus: "response-incomplete",
    passed: null,
    semanticScore: null,
    protocolValid: null,
    estimatedCostUsd: 0.02,
    failureReason: "max_output_tokens",
    exposure: exposureFor(cell),
    diagnosticSummary: {
      validity: "infrastructure-invalid",
      fixedEnvironmentIdentity: "offline-fixture",
    },
    artifactPayload: {
      result: {
        validity: "infrastructure-invalid",
      },
    },
  };
}

function exposureFor(
  cell: Readonly<P63V3RSemCompletionCell>
): P63ExposureEvidence {
  const fullRepositoryTokens = 4046;
  return {
    mode:
      cell.armKind === "AF"
        ? "AF-full"
        : "EL-static",
    budgetTokens: cell.budgetTokens,
    actualExposedTokens:
      cell.budgetTokens === "full"
        ? fullRepositoryTokens
        : cell.budgetTokens,
    fullRepositoryTokens,
    staticPayloadHash:
      `fixture-${cell.collectionSequence}`,
    exposureSetHash:
      cell.armKind === "AF"
        ? null
        : `set-${cell.collectionSequence}`,
    selectorPlanHash:
      cell.armKind === "AF"
        ? null
        : `selector-${cell.collectionSequence}`,
    selectedUnitCount:
      cell.armKind === "AF" ? null : 1,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
