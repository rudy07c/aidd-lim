import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { FixedEnvironmentBinding } from "./src/context/fixed-environment-runtime";
import type { P63CellOutcome, P63ExposureEvidence } from "./src/p6/p6-3-live-calibration-runner";
import {
  prepareP63V3CalibrationRun,
  type P63V3CalibrationTreatmentProvenance,
} from "./src/p6/p6-3-v3-calibration-runner";
import type { P63V3RunFixedEnvironmentProvenance } from "./src/p6/p6-3-v3-run-start";
import {
  applyP63V3Adjudication,
  assertP63V3ResumeCompatible,
  authorizeP63V3PaidLiveInvocation,
  createP63V3LiveCalibrationState,
  executeP63V3ControlledCalibration,
  P6_3_V3_LIVE_CONTROLLER_VERSION,
  P6_3_V3_LIVE_STATE_SCHEMA,
  P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV,
  P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG,
  summarizeP63V3ExecutionState,
  type P63V3LiveCalibrationState,
  type P63V3LiveControllerPersistence,
} from "./src/p6/p6-3-v3-live-controller";

const CHECKOUT_A = "a".repeat(40);
const CHECKOUT_B = "b".repeat(40);

function loadRepository(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadRepository(full, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function evidence(): P63ExposureEvidence {
  return {
    mode: "EL-static",
    budgetTokens: 0,
    actualExposedTokens: 0,
    fullRepositoryTokens: 4046,
    staticPayloadHash: "0".repeat(64),
    exposureSetHash: "1".repeat(64),
    selectorPlanHash: "2".repeat(64),
    selectedUnitCount: 0,
  };
}

function outcome(
  failureDomain: P63CellOutcome["failureDomain"] = "none"
): P63CellOutcome {
  return {
    failureDomain,
    executionStatus: failureDomain === "none" ? "ok" : `mock-${failureDomain}`,
    passed: failureDomain === "none" ? true : false,
    semanticScore: null,
    protocolValid: failureDomain === "protocol" ? false : true,
    estimatedCostUsd: 0,
    failureReason: failureDomain === "none" ? null : `mock ${failureDomain}`,
    exposure: evidence(),
    diagnosticSummary: { offlineVerifierMock: true },
    artifactPayload: { offlineVerifierMock: true, failureDomain },
  };
}

function persistenceJournal(): {
  persistence: P63V3LiveControllerPersistence;
  states: string[];
  artifacts: string[];
} {
  const states: string[] = [];
  const artifacts: string[] = [];
  return {
    states,
    artifacts,
    persistence: {
      persistState: (state) => {
        states.push(JSON.stringify(state));
      },
      persistAttemptArtifact: (cell, attempt, payload) => {
        const target = `mock-artifacts/${cell.sequence}/attempt-${attempt}.json`;
        artifacts.push(JSON.stringify({ target, payload }));
        return target;
      },
    },
  };
}

async function makePrepared(repositoryFiles: Record<string, string>) {
  const fixed: P63V3RunFixedEnvironmentProvenance[] = [];
  const treatment: P63V3CalibrationTreatmentProvenance[] = [];
  const prepared = await prepareP63V3CalibrationRun({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance: (value) => {
        fixed.push(value as P63V3RunFixedEnvironmentProvenance);
      },
      persistCalibrationTreatmentProvenance: (value) => {
        treatment.push(value as P63V3CalibrationTreatmentProvenance);
      },
    },
    runStartDependencies: {
      executeMCell: async () => outcome(),
      executeRSemCell: async () => outcome(),
    },
  });
  assert.equal(fixed.length, 1);
  assert.equal(treatment.length, 1);
  return prepared;
}

function validAuthorization(prepared: Awaited<ReturnType<typeof makePrepared>>, checkout = CHECKOUT_A) {
  return authorizeP63V3PaidLiveInvocation({
    invocation: {
      live: true,
      paidAuthorization: true,
      checkoutGitSha: checkout,
      environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
    },
    prepared,
  });
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const repositoryFiles: Record<string, string> = {};
  const repositoryDir = path.join(repoRoot, "synthetic-world", "repository");
  loadRepository(repositoryDir, repositoryDir, repositoryFiles);
  const prepared = await makePrepared(repositoryFiles);

  // 1. Runtime authorization requires all three operator/checkpoint signals:
  // live mode, explicit paid flag, and a distinct v3 environment guard.
  assert.throws(
    () => authorizeP63V3PaidLiveInvocation({
      invocation: {
        live: false,
        paidAuthorization: true,
        checkoutGitSha: CHECKOUT_A,
        environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
      },
      prepared,
    }),
    /requires live=true/
  );
  assert.throws(
    () => authorizeP63V3PaidLiveInvocation({
      invocation: {
        live: true,
        paidAuthorization: false,
        checkoutGitSha: CHECKOUT_A,
        environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
      },
      prepared,
    }),
    new RegExp(P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.throws(
    () => authorizeP63V3PaidLiveInvocation({
      invocation: {
        live: true,
        paidAuthorization: true,
        checkoutGitSha: CHECKOUT_A,
        environment: {},
      },
      prepared,
    }),
    new RegExp(P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV)
  );
  assert.throws(
    () => authorizeP63V3PaidLiveInvocation({
      invocation: {
        live: true,
        paidAuthorization: true,
        checkoutGitSha: "not-a-sha",
        environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
      },
      prepared,
    }),
    /40-character Git SHA/
  );

  const authorization = validAuthorization(prepared);
  const state = createP63V3LiveCalibrationState({
    prepared,
    authorization,
    now: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(state.schemaVersion, P6_3_V3_LIVE_STATE_SCHEMA);
  assert.equal(state.controllerVersion, P6_3_V3_LIVE_CONTROLLER_VERSION);
  assert.equal(state.checkoutGitSha, CHECKOUT_A);
  assert.equal(state.planHash, prepared.planHash);
  assert.equal(state.fixedEnvironmentIdentity, prepared.provenance.fixedEnvironmentIdentity);
  assert.equal(state.totalLogicalCells, 864);

  // 2. Happy-path mock execution covers the full frozen 864-cell plan and does
  // not invent replacement attempts.
  const happyJournal = persistenceJournal();
  let happyCalls = 0;
  await executeP63V3ControlledCalibration({
    state,
    prepared,
    authorization,
    executor: {
      execute: async () => {
        happyCalls += 1;
        return outcome("none");
      },
    },
    persistence: happyJournal.persistence,
  });
  assert.equal(happyCalls, 864);
  assert.equal(state.status, "completed");
  assert.equal(state.cursorCellIndex, 864);
  assert.equal(state.attempts.length, 864);
  assert.equal(state.attempts.filter((entry) => entry.attempt > 1).length, 0);
  assert.equal(happyJournal.artifacts.length, 864);
  assert.equal(summarizeP63V3ExecutionState(state).logicalCellsCompleted, 864);

  // 3. Resume is bound to exact checkout, plan, treatment provenance and E_fixed.
  const authOtherCheckout = validAuthorization(prepared, CHECKOUT_B);
  assert.throws(
    () => assertP63V3ResumeCompatible({
      state,
      prepared,
      authorization: authOtherCheckout,
    }),
    /checkout SHA changed/
  );
  const treatmentTamperedPrepared = {
    ...prepared,
    provenance: {
      ...prepared.provenance,
      repeatCount: 999,
    },
  } as any;
  assert.throws(
    () => assertP63V3ResumeCompatible({
      state,
      prepared: treatmentTamperedPrepared,
      authorization,
    }),
    /(different treatment|treatment provenance changed)/
  );

  // 4. Infrastructure outcomes never auto-retry. Explicit infrastructure-invalid
  // adjudication is required and the ceiling remains three scientific attempts.
  const infraState = createP63V3LiveCalibrationState({ prepared, authorization });
  const infraJournal = persistenceJournal();
  let infraCalls = 0;
  const infraExecutor = {
    execute: async () => {
      infraCalls += 1;
      return outcome("infrastructure");
    },
  };
  await executeP63V3ControlledCalibration({
    state: infraState,
    prepared,
    authorization,
    executor: infraExecutor,
    persistence: infraJournal.persistence,
  });
  assert.equal(infraCalls, 1);
  assert.equal(infraState.status, "needs-audit");
  assert.equal(infraState.cursorCellIndex, 0);
  assert.equal(infraState.nextAttempt, 1);

  applyP63V3Adjudication({
    state: infraState,
    prepared,
    request: {
      sequence: 0,
      attempt: 1,
      reviewer: "offline-verifier",
      reason: "known mock infrastructure failure",
      finalDisposition: "infrastructure-invalid",
    },
  });
  assert.equal(infraState.status, "running");
  assert.equal(infraState.cursorCellIndex, 0);
  assert.equal(infraState.nextAttempt, 2);

  await executeP63V3ControlledCalibration({
    state: infraState,
    prepared,
    authorization,
    executor: infraExecutor,
    persistence: infraJournal.persistence,
  });
  assert.equal(infraCalls, 2);
  applyP63V3Adjudication({
    state: infraState,
    prepared,
    request: {
      sequence: 0,
      attempt: 2,
      reviewer: "offline-verifier",
      reason: "known mock infrastructure failure",
      finalDisposition: "infrastructure-invalid",
    },
  });
  assert.equal(infraState.nextAttempt, 3);

  await executeP63V3ControlledCalibration({
    state: infraState,
    prepared,
    authorization,
    executor: infraExecutor,
    persistence: infraJournal.persistence,
  });
  assert.equal(infraCalls, 3);
  applyP63V3Adjudication({
    state: infraState,
    prepared,
    request: {
      sequence: 0,
      attempt: 3,
      reviewer: "offline-verifier",
      reason: "known mock infrastructure failure",
      finalDisposition: "infrastructure-invalid",
    },
  });
  assert.equal(infraState.status, "needs-audit");
  assert.equal(infraState.auditFlag?.kind, "max-infrastructure-attempts-exhausted");
  assert.equal(infraState.cursorCellIndex, 0);

  // 5. A provider-visible throw leaves persisted inFlight. The next invocation
  // must stop for explicit interruption adjudication and must not call executor.
  const interruptedState = createP63V3LiveCalibrationState({ prepared, authorization });
  const interruptedJournal = persistenceJournal();
  let throwingCalls = 0;
  await assert.rejects(
    () => executeP63V3ControlledCalibration({
      state: interruptedState,
      prepared,
      authorization,
      executor: {
        execute: async () => {
          throwingCalls += 1;
          throw new Error("simulated provider-visible interruption");
        },
      },
      persistence: interruptedJournal.persistence,
    }),
    /simulated provider-visible interruption/
  );
  assert.equal(throwingCalls, 1);
  assert.deepEqual(interruptedState.inFlight?.sequence, 0);
  const persistedBeforeThrow = JSON.parse(interruptedJournal.states.at(-1) ?? "null") as any;
  assert.equal(persistedBeforeThrow.inFlight.sequence, 0);

  let shouldNotRun = 0;
  await executeP63V3ControlledCalibration({
    state: interruptedState,
    prepared,
    authorization,
    executor: {
      execute: async () => {
        shouldNotRun += 1;
        return outcome();
      },
    },
    persistence: interruptedJournal.persistence,
  });
  assert.equal(shouldNotRun, 0);
  assert.equal(interruptedState.status, "needs-audit");
  assert.equal(interruptedState.auditFlag?.kind, "uncertain-in-flight-attempt");
  assert.equal(interruptedState.interruptedAttempts.length, 1);
  assert.throws(
    () => applyP63V3Adjudication({
      state: interruptedState,
      prepared,
      request: {
        sequence: 0,
        attempt: 1,
        reviewer: "offline-verifier",
        reason: "no trustworthy scientific output",
        finalDisposition: "scientific-failure",
      },
    }),
    /only be resolved as infrastructure-invalid/
  );
  applyP63V3Adjudication({
    state: interruptedState,
    prepared,
    request: {
      sequence: 0,
      attempt: 1,
      reviewer: "offline-verifier",
      reason: "provider-visible outcome unknown",
      finalDisposition: "infrastructure-invalid",
    },
  });
  assert.equal(interruptedState.status, "running");
  assert.equal(interruptedState.nextAttempt, 2);
  assert.equal(interruptedState.cursorCellIndex, 0);

  // 6. An infrastructure result may be adjudicated as a real scientific M
  // failure, in which case the logical cell advances rather than being replaced.
  const scientificState = createP63V3LiveCalibrationState({ prepared, authorization });
  const scientificJournal = persistenceJournal();
  await executeP63V3ControlledCalibration({
    state: scientificState,
    prepared,
    authorization,
    executor: { execute: async () => outcome("infrastructure") },
    persistence: scientificJournal.persistence,
  });
  assert.throws(
    () => applyP63V3Adjudication({
      state: scientificState,
      prepared,
      request: {
        sequence: 0,
        attempt: 1,
        reviewer: "offline-verifier",
        reason: "M protocol final disposition must remain prohibited",
        finalDisposition: "protocol-failure",
      },
    }),
    /does not use protocol-failure/
  );
  applyP63V3Adjudication({
    state: scientificState,
    prepared,
    request: {
      sequence: 0,
      attempt: 1,
      reviewer: "offline-verifier",
      reason: "classified as genuine scientific failure",
      finalDisposition: "scientific-failure",
    },
  });
  assert.equal(scientificState.cursorCellIndex, 1);
  assert.equal(scientificState.nextAttempt, 1);
  assert.equal(scientificState.status, "running");

  // 7. The controller is provider-neutral and does not import OpenAI/live entrypoints.
  const source = fs.readFileSync(
    path.join(__dirname, "src", "p6", "p6-3-v3-live-controller.ts"),
    "utf8"
  );
  for (const forbidden of [
    'from "openai"',
    "new OpenAI",
    "p6-3-v2-live-entrypoint",
    "p6-3-v2-calibration",
    "p6_3_v2_result_summary",
    "docs/findings",
  ]) {
    assert(!source.includes(forbidden), `v3 controller contains forbidden provider/historical dependency: ${forbidden}`);
  }

  process.stdout.write(JSON.stringify({
    status: "ok",
    controllerVersion: P6_3_V3_LIVE_CONTROLLER_VERSION,
    stateSchema: P6_3_V3_LIVE_STATE_SCHEMA,
    authorizationFlag: P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG,
    authorizationEnvironment: `${P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV}=1`,
    exactCheckoutBound: true,
    exactPlanBound: true,
    exactTreatmentProvenanceBound: true,
    exactFixedEnvironmentBound: true,
    happyPathLogicalCells: happyCalls,
    infrastructureAutoRetries: 0,
    maxInfrastructureInvalidAttempts: 3,
    interruptedOutcomeAutoRetries: 0,
    providerCalls: 0,
    liveInvocationPerformed: false,
    verified: [
      "two-signal-operator-authorization",
      "authorization-bound-to-checkout-and-treatment",
      "864-cell-happy-path-state-machine",
      "infrastructure-outcome-pauses-before-replacement",
      "three-attempt-infrastructure-invalid-ceiling",
      "provider-visible-interruption-fails-closed",
      "uncertain-interruption-only-resolvable-as-infrastructure-invalid",
      "M-protocol-adjudication-prohibited",
      "resume-refuses-checkout-or-treatment-drift",
      "provider-neutral-controller-source",
    ],
  }, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
