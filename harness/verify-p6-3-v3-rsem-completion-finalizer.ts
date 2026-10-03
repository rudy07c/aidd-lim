import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  loadDirRecursive,
} from "./p6-af-baseline-live";
import {
  selectP63V3ArtifactBudget,
} from "./src/p6/p6-3-v3-calibration-predeclaration";
import {
  authorizeP63V3RSemCompletionInvocation,
  createP63V3RSemCompletionState,
  executeP63V3ControlledRSemCompletion,
  P6_3_V3_RSEM_COMPLETION_PAID_ENV,
} from "./src/p6/p6-3-v3-rsem-completion-controller";
import {
  finalizeP63V3RSemCompletion,
  P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION,
  P6_3_V3_RSEM_COMPLETION_RESULT_SCHEMA,
} from "./src/p6/p6-3-v3-rsem-completion-finalizer";
import {
  P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
} from "./src/p6/p6-3-v3-rsem-completion-executor";
import {
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-v3-rsem-completion-predeclaration";
import type {
  P63V3RSemCompletionCell,
} from "./src/p6/p6-3-v3-rsem-completion-plan";
import {
  prepareP63V3RSemCompletionRun,
} from "./src/p6/p6-3-v3-rsem-completion-runner";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./src/p6/p6-3-live-calibration-runner";

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
      checkoutGitSha: "c".repeat(40),
      executionMode: "provider-scientific",
      prepared,
    });
  const state = createP63V3RSemCompletionState({
    prepared,
    authorization,
  });
  const runDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "p6-3-v3-rsem-completion-finalizer-"
    )
  );
  fs.mkdirSync(
    path.join(runDir, "attempts"),
    { recursive: true }
  );

  await executeP63V3ControlledRSemCompletion({
    state,
    prepared,
    authorization,
    persistence: {
      persistState() {},
      persistAttemptArtifact(cell, attempt, payload) {
        const relative =
          `attempts/${cell.collectionSequence}-${attempt}.json`;
        fs.writeFileSync(
          path.join(runDir, relative),
          JSON.stringify(payload, null, 2) + "\n",
          "utf8"
        );
        return relative;
      },
    },
    executor: {
      execute: async (cell) =>
        scientificOutcome(cell),
    },
  });
  assert.equal(state.status, "completed");
  assert.equal(state.attempts.length, 72);

  const result = finalizeP63V3RSemCompletion({
    repoRoot,
    freshRSemRunDir: runDir,
    freshRSemState: state,
  });

  assert.equal(
    result.schemaVersion,
    P6_3_V3_RSEM_COMPLETION_RESULT_SCHEMA
  );
  assert.equal(
    result.finalizerVersion,
    P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION
  );
  assert.equal(result.runClass, "scientific-calibration-completion");
  assert.equal(result.integrity.combinedLogicalCells, 864);
  assert.equal(
    result.integrity.inheritedMValidObservations,
    792
  );
  assert.equal(
    result.integrity.freshRSemValidObservations,
    72
  );
  assert.equal(result.arms.length, 6);
  for (const arm of result.arms) {
    assert.equal(arm.m.observations, 132);
    assert.equal(arm.m.total, 132);
    assert.equal(arm.m.repeatMeans.length, 12);
    assert.equal(arm.rsem.observations, 12);
    assert.equal(arm.rsem.total, 144);
    assert.equal(arm.rsem.repeatMeans.length, 12);
  }

  const expectedSelection =
    selectP63V3ArtifactBudget(
      result.arms.map((arm) => ({
        label: arm.arm,
        mRate: arm.m.mean,
        rsemRate: arm.rsem.mean,
      }))
    );
  assert.deepEqual(result.selection, expectedSelection);
  assert.equal(
    result.interpretationBoundary.splitProvenanceAnalysis,
    true
  );
  assert.equal(
    result.interpretationBoundary.singleRuntimeInvocationClaimed,
    false
  );
  assert.equal(
    result.interpretationBoundary.stoppedV3RSemPooled,
    false
  );
  assert.equal(
    result.interpretationBoundary.reliabilityAuditPooled,
    false
  );
  assert.equal(
    result.interpretationBoundary.historicalV2PrimaryEstimatePooled,
    false
  );

  const planHashTamper = clone(state) as any;
  planHashTamper.planHash = "d".repeat(64);
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: planHashTamper,
      }),
    /plan hash differs/
  );

  const provenanceHashTamper = clone(state) as any;
  provenanceHashTamper.provenanceHash = "e".repeat(64);
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: provenanceHashTamper,
      }),
    /treatment provenance hash mismatch/
  );

  const authorizationDigestTamper = clone(state) as any;
  authorizationDigestTamper.authorizationDigest = "f".repeat(64);
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: authorizationDigestTamper,
      }),
    /authorization digest mismatch/
  );

  const checkoutShaTamper = clone(state) as any;
  checkoutShaTamper.checkoutGitSha = "not-a-sha";
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: checkoutShaTamper,
      }),
    /checkoutGitSha is malformed/
  );

  const firstStateArtifactPath = path.join(
    runDir,
    state.attempts[0].artifactPath!
  );
  const firstStateArtifactOriginal =
    fs.readFileSync(
      firstStateArtifactPath,
      "utf8"
    );

  const missingScore = clone(state) as any;
  missingScore.attempts[0].semanticScore = null;
  const missingScoreArtifact =
    JSON.parse(firstStateArtifactOriginal) as any;
  missingScoreArtifact.result.booleanAccuracy =
    null;
  fs.writeFileSync(
    firstStateArtifactPath,
    JSON.stringify(
      missingScoreArtifact,
      null,
      2
    ) + "\n",
    "utf8"
  );
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: missingScore,
      }),
    /lacks a protocol-valid semantic score/
  );
  fs.writeFileSync(
    firstStateArtifactPath,
    firstStateArtifactOriginal,
    "utf8"
  );

  const denominatorDrift = clone(state) as any;
  denominatorDrift.attempts[0].diagnosticSummary.booleanTotal = 11;
  const denominatorArtifact =
    JSON.parse(firstStateArtifactOriginal) as any;
  denominatorArtifact.result.booleanTotal = 11;
  fs.writeFileSync(
    firstStateArtifactPath,
    JSON.stringify(
      denominatorArtifact,
      null,
      2
    ) + "\n",
    "utf8"
  );
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: denominatorDrift,
      }),
    /probe denominator\/count drift/
  );
  fs.writeFileSync(
    firstStateArtifactPath,
    firstStateArtifactOriginal,
    "utf8"
  );

  const duplicateValid = clone(state) as any;
  duplicateValid.attempts.push({
    ...duplicateValid.attempts[0],
    attempt: 2,
    artifactPath: "attempts/duplicate.json",
  });
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: duplicateValid,
      }),
    /exactly one valid observation|attempt journal/
  );

  const invalidUnadjudicated = clone(state) as any;
  invalidUnadjudicated.attempts[0] = {
    ...invalidUnadjudicated.attempts[0],
    attempt: 2,
  };
  invalidUnadjudicated.attempts.unshift({
    ...invalidUnadjudicated.attempts[0],
    attempt: 1,
    rawValidity: "infrastructure-invalid",
    effectiveValidity: "infrastructure-invalid",
    rawFailureDomain: "infrastructure",
    effectiveFailureDomain: "infrastructure",
    infrastructureAdjudication: "pending",
    adjudication: null,
    semanticScore: null,
    protocolValid: null,
    artifactPath: "attempts/unadjudicated-invalid.json",
  });
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: invalidUnadjudicated,
      }),
    /infrastructure-invalid without completed adjudication/
  );

  const firstArtifactPath = path.join(
    runDir,
    state.attempts[0].artifactPath!
  );
  const originalArtifact = fs.readFileSync(
    firstArtifactPath,
    "utf8"
  );

  fs.unlinkSync(firstArtifactPath);
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: state,
      }),
    /attempt artifact missing/
  );
  fs.writeFileSync(
    firstArtifactPath,
    originalArtifact,
    "utf8"
  );

  fs.writeFileSync(
    firstArtifactPath,
    "{not-json",
    "utf8"
  );
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: state,
      }),
    /attempt artifact is not valid JSON object/
  );
  fs.writeFileSync(
    firstArtifactPath,
    originalArtifact,
    "utf8"
  );

  const tamperedArtifact = JSON.parse(
    originalArtifact
  ) as any;
  tamperedArtifact.result.booleanCorrect += 1;
  fs.writeFileSync(
    firstArtifactPath,
    JSON.stringify(tamperedArtifact, null, 2) + "\n",
    "utf8"
  );
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: state,
      }),
    /attempt artifact\/state outcome mismatch/
  );
  fs.writeFileSync(
    firstArtifactPath,
    originalArtifact,
    "utf8"
  );

  const escapeState = clone(state) as any;
  escapeState.attempts[0].artifactPath =
    "../outside.json";
  assert.throws(
    () =>
      finalizeP63V3RSemCompletion({
        repoRoot,
        freshRSemRunDir: runDir,
        freshRSemState: escapeState,
      }),
    /escapes run directory/
  );

  assert.equal(
    result.source.freshRSem.attemptArtifacts.length,
    72
  );
  assert.match(
    result.source.freshRSem.attemptArtifactsSha256,
    /^[0-9a-f]{64}$/
  );

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-completion-finalizer",
    providerCallsMade: false,
    combinedLogicalCells:
      result.integrity.combinedLogicalCells,
    inheritedMValidObservations:
      result.integrity.inheritedMValidObservations,
    freshRSemValidObservations:
      result.integrity.freshRSemValidObservations,
    armDenominators: Object.fromEntries(
      result.arms.map((arm) => [
        arm.arm,
        {
          m: arm.m.total,
          rsemBank: arm.rsem.observations,
          rsemJudgments: arm.rsem.total,
        },
      ])
    ),
    selection: result.selection,
    attemptArtifactsSha256:
      result.source.freshRSem.attemptArtifactsSha256,
    attemptArtifactCount:
      result.source.freshRSem.attemptArtifacts.length,
    verified: [
      "repository-promoted-inherited-M-is-the-only-M-source",
      "fresh-Rsem-state-must-be-terminal-completed-and-audit-free",
      "fresh-Rsem-plan-hash-and-E-fixed-binding-are-exact",
      "fresh-Rsem-treatment-provenance-hash-is-recomputed",
      "fresh-Rsem-authorization-digest-is-recomputed",
      "fresh-Rsem-checkout-sha-is-validated",
      "exactly-one-valid-fresh-Rsem-observation-per-collection-sequence",
      "fresh-Rsem-canonical-sequence-mapping-is-verified",
      "M-132-per-arm",
      "Rsem-12-bank-observations-per-arm",
      "Rsem-144-probe-judgments-per-arm",
      "missing-Rsem-score-fails-closed",
      "Rsem-denominator-drift-fails-closed",
      "duplicate-valid-observation-fails-closed",
      "unadjudicated-infrastructure-invalid-attempt-fails-closed",
      "attempt-artifact-missing-fails-closed",
      "attempt-artifact-invalid-json-fails-closed",
      "attempt-artifact-state-mismatch-fails-closed",
      "attempt-artifact-path-traversal-fails-closed",
      "attempt-artifact-set-is-hash-bound-into-result",
      "frozen-v3-conjunctive-co-gate-is-reused",
      "no-stopped-v3-Rsem-or-reliability-audit-pooling-input-exists",
    ],
  }, null, 2));
  fs.rmSync(runDir, {
    recursive: true,
    force: true,
  });
}

function scientificOutcome(
  cell: Readonly<P63V3RSemCompletionCell>
): P63CellOutcome {
  const correctByArm: Record<string, number> = {
    B0: 2,
    B1: 4,
    B2: 6,
    B3: 8,
    B4: 10,
    AF: 12,
  };
  const correct = correctByArm[cell.armLabel];
  const total = 12;
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: null,
    semanticScore: correct / total,
    protocolValid: true,
    estimatedCostUsd: 0.01,
    failureReason: null,
    exposure: exposureFor(cell),
    diagnosticSummary: {
      validity: "valid",
      booleanCorrect: correct,
      booleanTotal: total,
    },
    artifactPayload: {
      executorVersion:
        P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
      completionPredeclarationVersion:
        P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
      providerContract: {
        ...P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
      },
      fixedEnvironment: {
        identity:
          P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
      },
      result: {
        repeat: cell.repeat,
        executionStatus: "ok",
        validity: "valid",
        failureDomain: "none",
        protocolValid: true,
        failureReason: null,
        booleanCorrect: correct,
        booleanTotal: total,
        booleanAccuracy: correct / total,
        estimatedCostUsd: 0.01,
        modelProvenance: {
          requestedModel:
            P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.model,
          reasoningEffort:
            P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.reasoningEffort,
          maxOutputTokens:
            P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
          requestTimeoutMs:
            P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.requestTimeoutMs,
          maxRetries:
            P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
        },
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
      `finalizer-fixture-${cell.collectionSequence}`,
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
