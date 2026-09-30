import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { P63CellOutcome, P63ExposureEvidence } from "./src/p6/p6-3-live-calibration-runner";
import { P6_3_RSEM_FAILURE_SEMANTICS } from "./src/p6/p6-3-rsem-protocol-parity";
import {
  prepareP63V3CalibrationRun,
  type P63V3PreparedCalibrationRun,
} from "./src/p6/p6-3-v3-calibration-runner";
import {
  applyP63V3Adjudication,
  authorizeP63V3PaidLiveInvocation,
  createP63V3LiveCalibrationState,
  executeP63V3ControlledCalibration,
  P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV,
  type P63V3LiveControllerPersistence,
} from "./src/p6/p6-3-v3-live-controller";
import { requireP63V3ScientificValidity } from "./src/p6/p6-3-v3-scientific-validity";

const CHECKOUT = "c".repeat(40);
const FIRST_RSEM_SEQUENCE = 792;

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

function outcome(args: {
  validity?: "valid" | "infrastructure-invalid";
  diagnosticValidity?: "valid" | "infrastructure-invalid";
  failureDomain: P63CellOutcome["failureDomain"];
  executionStatus: string;
  semanticScore?: number | null;
  protocolValid?: boolean | null;
}): P63CellOutcome {
  const diagnosticSummary: Record<string, unknown> = { offlineValidityVerifier: true };
  if (args.diagnosticValidity !== undefined) diagnosticSummary.validity = args.diagnosticValidity;
  const result: Record<string, unknown> = {
    executionStatus: args.executionStatus,
    failureDomain: args.failureDomain,
  };
  if (args.validity !== undefined) result.validity = args.validity;
  return {
    failureDomain: args.failureDomain,
    executionStatus: args.executionStatus,
    passed: null,
    semanticScore: args.semanticScore ?? null,
    protocolValid: args.protocolValid ?? null,
    estimatedCostUsd: 0,
    failureReason: args.failureDomain === "none" ? null : args.executionStatus,
    exposure: evidence(),
    diagnosticSummary,
    artifactPayload: { result, offlineValidityVerifier: true },
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
      persistState: (state) => states.push(JSON.stringify(state)),
      persistAttemptArtifact: (cell, attempt, payload) => {
        artifacts.push(JSON.stringify({ sequence: cell.sequence, attempt, payload }));
        return `mock/${cell.sequence}/attempt-${attempt}.json`;
      },
    },
  };
}

async function prepare(): Promise<Readonly<P63V3PreparedCalibrationRun>> {
  const repoRoot = path.resolve(__dirname, "..");
  const repositoryDir = path.join(repoRoot, "synthetic-world", "repository");
  const repositoryFiles: Record<string, string> = {};
  loadRepository(repositoryDir, repositoryDir, repositoryFiles);
  return prepareP63V3CalibrationRun({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance: () => undefined,
      persistCalibrationTreatmentProvenance: () => undefined,
    },
  });
}

function authorization(prepared: Readonly<P63V3PreparedCalibrationRun>) {
  return authorizeP63V3PaidLiveInvocation({
    invocation: {
      live: true,
      paidAuthorization: true,
      checkoutGitSha: CHECKOUT,
      environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
    },
    prepared,
  });
}

async function main(): Promise<void> {
  const frozenScoringError = P6_3_RSEM_FAILURE_SEMANTICS.find(
    (entry) => entry.id === "probe-scoring-error"
  );
  assert.deepEqual(frozenScoringError, {
    id: "probe-scoring-error",
    validity: "infrastructure-invalid",
    failureDomain: "system",
    protocolValid: null,
  });

  // Explicit executor validity is authoritative and remains independent of domain.
  assert.equal(
    requireP63V3ScientificValidity(outcome({
      validity: "infrastructure-invalid",
      failureDomain: "system",
      executionStatus: "probe-scoring-error",
    })),
    "infrastructure-invalid"
  );
  assert.throws(
    () => requireP63V3ScientificValidity(outcome({
      validity: "infrastructure-invalid",
      diagnosticValidity: "valid",
      failureDomain: "system",
      executionStatus: "probe-scoring-error",
    })),
    /validity mismatch/
  );
  assert.throws(
    () => requireP63V3ScientificValidity(outcome({
      failureDomain: "system",
      executionStatus: "probe-scoring-error",
    })),
    /missing scientific validity/
  );
  assert.equal(
    requireP63V3ScientificValidity(outcome({
      failureDomain: "infrastructure",
      executionStatus: "provider-error",
    })),
    "infrastructure-invalid"
  );
  assert.equal(
    requireP63V3ScientificValidity(outcome({
      failureDomain: "none",
      executionStatus: "ok",
    })),
    "valid"
  );

  const prepared = await prepare();
  assert.equal(prepared.plan[FIRST_RSEM_SEQUENCE]?.measurement, "Rsem");
  const auth = authorization(prepared);

  // Regression: frozen probe-scoring-error is invalid even though its raw domain
  // is system. It must pause at the same logical cell and require adjudication.
  const invalidState = createP63V3LiveCalibrationState({ prepared, authorization: auth });
  invalidState.cursorCellIndex = FIRST_RSEM_SEQUENCE;
  const invalidJournal = persistenceJournal();
  let invalidCalls = 0;
  await executeP63V3ControlledCalibration({
    state: invalidState,
    prepared,
    authorization: auth,
    executor: {
      execute: async () => {
        invalidCalls += 1;
        return outcome({
          validity: "infrastructure-invalid",
          diagnosticValidity: "infrastructure-invalid",
          failureDomain: "system",
          executionStatus: "probe-scoring-error",
        });
      },
    },
    persistence: invalidJournal.persistence,
  });
  assert.equal(invalidCalls, 1);
  assert.equal(invalidState.status, "needs-audit");
  assert.equal(invalidState.cursorCellIndex, FIRST_RSEM_SEQUENCE);
  assert.equal(invalidState.attempts.length, 1);
  assert.equal(invalidState.attempts[0].rawValidity, "infrastructure-invalid");
  assert.equal(invalidState.attempts[0].effectiveValidity, "infrastructure-invalid");
  assert.equal(invalidState.attempts[0].rawFailureDomain, "system");
  assert.equal(invalidState.attempts[0].effectiveFailureDomain, "system");
  assert.equal(invalidState.attempts[0].infrastructureAdjudication, "pending");
  assert.equal(invalidState.auditFlag?.kind, "infrastructure-adjudication-required");

  applyP63V3Adjudication({
    state: invalidState,
    prepared,
    request: {
      sequence: FIRST_RSEM_SEQUENCE,
      attempt: 1,
      reviewer: "offline-validity-verifier",
      reason: "frozen probe-scoring-error validity is infrastructure-invalid",
      finalDisposition: "infrastructure-invalid",
    },
  });
  assert.equal(invalidState.status, "running");
  assert.equal(invalidState.cursorCellIndex, FIRST_RSEM_SEQUENCE);
  assert.equal(invalidState.nextAttempt, 2);
  assert.equal(invalidState.attempts[0].effectiveValidity, "infrastructure-invalid");
  assert.equal(invalidState.attempts[0].effectiveFailureDomain, "system");
  assert.equal(invalidState.attempts[0].infrastructureAdjudication, "infrastructure-invalid");

  // A valid protocol failure remains a scientific observation. The following
  // cell then emits the invalid scoring case so the test stops after two calls.
  const protocolState = createP63V3LiveCalibrationState({ prepared, authorization: auth });
  protocolState.cursorCellIndex = FIRST_RSEM_SEQUENCE;
  const protocolJournal = persistenceJournal();
  let protocolCalls = 0;
  await executeP63V3ControlledCalibration({
    state: protocolState,
    prepared,
    authorization: auth,
    executor: {
      execute: async () => {
        protocolCalls += 1;
        if (protocolCalls === 1) {
          return outcome({
            validity: "valid",
            diagnosticValidity: "valid",
            failureDomain: "protocol",
            executionStatus: "output-parse-failure",
            protocolValid: false,
          });
        }
        return outcome({
          validity: "infrastructure-invalid",
          diagnosticValidity: "infrastructure-invalid",
          failureDomain: "system",
          executionStatus: "probe-scoring-error",
        });
      },
    },
    persistence: protocolJournal.persistence,
  });
  assert.equal(protocolCalls, 2);
  assert.equal(protocolState.cursorCellIndex, FIRST_RSEM_SEQUENCE + 1);
  assert.equal(protocolState.attempts[0].rawValidity, "valid");
  assert.equal(protocolState.attempts[0].effectiveValidity, "valid");
  assert.equal(protocolState.attempts[0].effectiveFailureDomain, "protocol");
  assert.equal(protocolState.attempts[0].infrastructureAdjudication, "not-applicable");
  assert.equal(protocolState.attempts[1].rawValidity, "infrastructure-invalid");
  assert.equal(protocolState.status, "needs-audit");

  // Ambiguous system-domain results without validity fail before committing a
  // scientific attempt. Persisted inFlight therefore protects resume semantics.
  const missingState = createP63V3LiveCalibrationState({ prepared, authorization: auth });
  missingState.cursorCellIndex = FIRST_RSEM_SEQUENCE;
  const missingJournal = persistenceJournal();
  await assert.rejects(
    () => executeP63V3ControlledCalibration({
      state: missingState,
      prepared,
      authorization: auth,
      executor: {
        execute: async () => outcome({
          failureDomain: "system",
          executionStatus: "probe-scoring-error",
        }),
      },
      persistence: missingJournal.persistence,
    }),
    /missing scientific validity/
  );
  assert.equal(missingState.attempts.length, 0);
  assert.equal(missingState.inFlight?.sequence, FIRST_RSEM_SEQUENCE);
  assert.equal(missingJournal.artifacts.length, 0);

  process.stdout.write(JSON.stringify({
    verifier: "p6-3-v3-validity-propagation-v1",
    providerCalls: 0,
    checks: [
      "frozen-probe-scoring-error-semantics-preserved",
      "validity-domain-independence",
      "validity-mismatch-fails-closed",
      "ambiguous-missing-validity-fails-closed",
      "system-domain-invalid-pauses-before-advance",
      "invalid-system-adjudication-retries-same-cell",
      "raw-system-domain-preserved-after-invalid-adjudication",
      "valid-protocol-failure-remains-scientific",
      "legacy-none-and-infrastructure-combinations-remain-unambiguous",
    ],
  }, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
