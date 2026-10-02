import assert from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_FROZEN_EVIDENCE_FILES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_INPUT_FILES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_OPERATIONAL_EVIDENCE_FILES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_SOURCE_FILES,
  assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken,
  runP63V3RSemReliabilityAuditFinalPreLiveGate,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-final-prelive-gate";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV,
  type P63V3RSemReliabilityAuditExecutor,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-controller";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ENTRYPOINT_VERSION,
  runP63V3RSemReliabilityAuditLiveEntrypoint,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-live-entrypoint";
import type {
  P63V3RSemReliabilityAuditExecutorOutcome,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-executor";

async function main(): Promise<void> {
  const harnessRoot = __dirname;
  const token =
    runP63V3RSemReliabilityAuditFinalPreLiveGate(harnessRoot);
  const receipt = token.receipt;

  assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken(token);

  assert.equal(
    receipt.schemaVersion,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA
  );
  assert.equal(
    receipt.gateVersion,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION
  );
  assert.equal(receipt.runClass, "reliability-audit");
  assert.equal(receipt.scientificPoolingAllowed, false);
  assert.equal(receipt.confirmatoryStage1AEligible, false);
  assert.deepEqual(receipt.candidateCaps, [32000, 64000]);
  assert.equal(receipt.hardAuditCap, 64000);
  assert.equal(receipt.plannedValidTrialCeiling, 120);
  assert.equal(receipt.providerAttemptCeiling, 360);
  assert.equal(receipt.auditProviderMaxRetries, 0);
  assert.equal(receipt.sdkAutomaticRetriesDisabled, true);
  assert.equal(receipt.interruptedAttemptCostReservation, true);
  assert.equal(receipt.usageLessAttemptCostReservation, true);
  assert.equal(receipt.headroomDiagnosticsAffectQualification, false);
  assert.equal(receipt.operationalCostCeilingUsd, 22);
  assert.equal(receipt.preflightPassed, true);
  assert.equal(receipt.exactCleanCheckoutVerified, true);
  assert.equal(receipt.runtimeConsumedUntrackedFilesVerified, true);
  assert.equal(receipt.paidLiveAuthorizationRequired, true);
  assert.equal(receipt.liveAuthorized, false);
  assert.equal(receipt.providerCallsMade, false);
  assert.match(receipt.checkoutGitSha, /^[0-9a-f]{40}$/);

  assert.deepEqual(
    receipt.verifiers.map((item) => item.script),
    [...P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS]
  );
  assert(receipt.verifiers.every((item) => item.status === "pass"));

  assertEvidencePaths(
    receipt.sourceEvidence,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_SOURCE_FILES
  );
  assertEvidencePaths(
    receipt.frozenEvidence,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_FROZEN_EVIDENCE_FILES
  );
  assertEvidencePaths(
    receipt.operationalEvidence,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_OPERATIONAL_EVIDENCE_FILES
  );
  assertEvidencePaths(
    receipt.inputEvidence,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_INPUT_FILES
  );
  assertEvidencePaths(
    receipt.verifierEvidence,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS.map(
      (script) => `harness/${script}`
    )
  );
  const sourcePaths = new Set(
    receipt.sourceEvidence.map((item) => item.path)
  );
  assert(
    sourcePaths.has(
      "harness/src/p6/p6-3-v3-rsem-reliability-audit-live-entrypoint.ts"
    )
  );
  assert(
    sourcePaths.has("harness/p6-3-v3-rsem-reliability-audit.ts")
  );

  const gateSource = fs.readFileSync(
    path.join(
      __dirname,
      "src",
      "p6",
      "p6-3-v3-rsem-reliability-audit-final-prelive-gate.ts"
    ),
    "utf8"
  );
  assert(gateSource.includes('"OPENAI_API_KEY"'));
  assert(
    gateSource.includes(
      '"P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ALLOWED"'
    )
  );
  assert(gateSource.includes("providerCallsMade: false"));
  assert(
    gateSource.includes(
      "assertNoUntrackedP63V3RuntimeRepositoryFiles(repoRoot)"
    )
  );

  // Production CLI dry path must execute the same final gate without any
  // provider credential or paid-live authorization.
  const cliEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV,
  ]) {
    delete cliEnv[key];
  }
  const cli = spawnSync(
    process.execPath,
    [
      "-r",
      require.resolve("ts-node/register"),
      path.join(
        harnessRoot,
        "p6-3-v3-rsem-reliability-audit.ts"
      ),
    ],
    {
      cwd: harnessRoot,
      encoding: "utf8",
      env: cliEnv,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  assert.equal(
    cli.status,
    0,
    `Rsem reliability audit dry CLI failed\nstdout:\n${cli.stdout}\nstderr:\n${cli.stderr}`
  );
  assert.match(cli.stdout, /dry preflight passed/);
  assert.match(cli.stdout, /"liveAuthorized":false/);
  assert.match(cli.stdout, /"providerCallsMade":false/);

  // Provider-capable direct entrypoint must refuse production execution
  // without an API key before any provider call.
  await assert.rejects(
    () =>
      runP63V3RSemReliabilityAuditLiveEntrypoint({
        finalPreLiveToken: token,
        paidAuthorization: true,
        environment: {
          [P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]: "1",
        },
        resumePath: null,
        adjudicationPath: null,
      }),
    /OPENAI_API_KEY/
  );

  // Exercise the actual entrypoint/persistence/exposure/controller path with
  // the provider executor replaced by a semantic-free reliability mock.
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "p6-3-v3-rsem-reliability-entrypoint-")
  );
  const statePath = path.join(tempRoot, "run", "state.json");
  let calls = 0;
  const mockExecutor: P63V3RSemReliabilityAuditExecutor = {
    execute: async (cell) => {
      calls += 1;
      return validOutcome(cell.candidateCap);
    },
  };

  try {
    const result =
      await runP63V3RSemReliabilityAuditLiveEntrypoint({
        finalPreLiveToken: token,
        paidAuthorization: true,
        environment: {
          [P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]: "1",
        },
        resumePath: null,
        adjudicationPath: null,
        testDependencies: {
          executor: mockExecutor,
          newStatePath: statePath,
        },
      });

    assert.equal(result.statePath, statePath);
    assert.equal(result.state.status, "completed");
    assert.equal(result.state.selectedMaxOutputTokens, 32000);
    assert.equal(calls, 60);
    assert.equal(result.state.attempts.length, 60);
    assert.equal(result.state.interruptedAttempts.length, 0);
    assert.equal(result.state.reservedUnknownCostUsd, 0);
    assert.equal(result.state.scientificPoolingAllowed, false);

    const runDir = path.dirname(statePath);
    for (const file of [
      "p6-3-v3-rsem-reliability-audit-final-prelive-receipt.json",
      "fixed-environment-run.json",
      "audit-provenance.json",
      "state.json",
    ]) {
      assert(
        fs.existsSync(path.join(runDir, file)),
        `missing persisted audit run file: ${file}`
      );
    }
    const attemptFiles = fs.readdirSync(
      path.join(runDir, "attempts")
    );
    assert.equal(
      attemptFiles.length,
      60,
      "expected one persisted attempt artifact per qualified 32k trial"
    );

    const persistedState = JSON.parse(
      fs.readFileSync(statePath, "utf8")
    ) as any;
    assert.equal(persistedState.status, "completed");
    assert.equal(persistedState.selectedMaxOutputTokens, 32000);
    assert.equal(persistedState.attempts.length, 60);
    assert.equal(persistedState.reservedUnknownCostUsd, 0);
    assert.equal(persistedState.checkoutGitSha, receipt.checkoutGitSha);
    assert.equal(persistedState.scientificPoolingAllowed, false);
    assert.equal(
      persistedState.attempts[0].booleanCorrect,
      undefined
    );
    assert.equal(
      persistedState.attempts[0].semanticScore,
      undefined
    );
    assert.equal(persistedState.attempts[0].rawResponse, undefined);

    // Completed resume verifies receipt/provenance/state and makes no new call.
    const beforeResumeCalls = calls;
    const resumed =
      await runP63V3RSemReliabilityAuditLiveEntrypoint({
        finalPreLiveToken: token,
        paidAuthorization: true,
        environment: {
          [P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]: "1",
        },
        resumePath: statePath,
        adjudicationPath: null,
        testDependencies: { executor: mockExecutor },
      });
    assert.equal(resumed.state.status, "completed");
    assert.equal(calls, beforeResumeCalls);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  // An interrupted provider-capable attempt must be persisted as in-flight,
  // then converted on resume into a consumed attempt with conservative cost
  // reservation before any replacement is allowed.
  const interruptedRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "p6-3-v3-rsem-reliability-interrupted-")
  );
  const interruptedStatePath =
    path.join(interruptedRoot, "run", "state.json");
  try {
    await assert.rejects(
      () =>
        runP63V3RSemReliabilityAuditLiveEntrypoint({
          finalPreLiveToken: token,
          paidAuthorization: true,
          environment: {
            [P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]: "1",
          },
          resumePath: null,
          adjudicationPath: null,
          testDependencies: {
            executor: {
              execute: async () => {
                throw new Error("offline simulated process interruption");
              },
            },
            newStatePath: interruptedStatePath,
          },
        }),
      /offline simulated process interruption/
    );
    const beforeRecovery = JSON.parse(
      fs.readFileSync(interruptedStatePath, "utf8")
    ) as any;
    assert(beforeRecovery.inFlight);
    assert.equal(beforeRecovery.reservedUnknownCostUsd, 0);

    let replacementCalls = 0;
    const recovered =
      await runP63V3RSemReliabilityAuditLiveEntrypoint({
        finalPreLiveToken: token,
        paidAuthorization: true,
        environment: {
          [P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]: "1",
        },
        resumePath: interruptedStatePath,
        adjudicationPath: null,
        testDependencies: {
          executor: {
            execute: async (cell) => {
              replacementCalls += 1;
              return validOutcome(cell.candidateCap);
            },
          },
        },
      });
    assert.equal(recovered.state.status, "needs-audit");
    assert.equal(
      recovered.state.auditFlag?.kind,
      "uncertain-in-flight-attempt"
    );
    assert.equal(recovered.state.interruptedAttempts.length, 1);
    assert(recovered.state.reservedUnknownCostUsd > 0);
    assert.equal(
      recovered.state.interruptedAttempts[0].reservedCostUsd,
      recovered.state.reservedUnknownCostUsd
    );
    assert.equal(replacementCalls, 0);
  } finally {
    fs.rmSync(interruptedRoot, { recursive: true, force: true });
  }

  const cliSource = fs.readFileSync(
    path.join(harnessRoot, "p6-3-v3-rsem-reliability-audit.ts"),
    "utf8"
  );
  const paidGuard = cliSource.indexOf("if (!args.paidAuthorization)");
  const envGuard = cliSource.indexOf(
    "process.env[P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]"
  );
  const apiGuard = cliSource.indexOf("if (!process.env.OPENAI_API_KEY)");
  const dynamicImport = cliSource.indexOf(
    'await import(\n    "./src/p6/p6-3-v3-rsem-reliability-audit-live-entrypoint"'
  );
  assert(
    paidGuard >= 0 &&
      envGuard > paidGuard &&
      apiGuard > envGuard &&
      dynamicImport > apiGuard
  );

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-reliability-audit-final-prelive",
    gateVersion:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION,
    entrypointVersion:
      P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ENTRYPOINT_VERSION,
    checkoutGitSha: receipt.checkoutGitSha,
    runtimeEnvironment: receipt.runtimeEnvironment,
    candidateCaps: receipt.candidateCaps,
    plannedValidTrialCeiling: receipt.plannedValidTrialCeiling,
    providerAttemptCeiling: receipt.providerAttemptCeiling,
    auditProviderMaxRetries: receipt.auditProviderMaxRetries,
    sdkAutomaticRetriesDisabled: receipt.sdkAutomaticRetriesDisabled,
    interruptedAttemptCostReservation:
      receipt.interruptedAttemptCostReservation,
    usageLessAttemptCostReservation:
      receipt.usageLessAttemptCostReservation,
    headroomDiagnosticsAffectQualification:
      receipt.headroomDiagnosticsAffectQualification,
    operationalCostCeilingUsd: receipt.operationalCostCeilingUsd,
    providerCallsMade: receipt.providerCallsMade,
    mockedQualifiedCalls: calls,
    persistedAttemptArtifacts: 60,
    completedResumeAdditionalProviderCalls: 0,
    actualPaidLiveRunPerformed: false,
    verified: [
      "actual-final-prelive-gate-executed",
      "exact-clean-checkout-bound",
      "runtime-environment-bound",
      "untracked-runtime-input-rejected",
      "32k-64k-envelope-bound",
      "120-valid-360-attempt-boundary-bound",
      "sdk-automatic-retries-disabled-and-bound",
      "provider-declared-cap-censoring-bound",
      "interrupted-attempt-cost-reservation-bound",
      "usage-less-attempt-cost-reservation-bound",
      "headroom-diagnostics-remain-non-selective",
      "22-usd-operational-ceiling-bound",
      "predeclaration-cost-freeze-operational-evidence-hashed",
      "provider-credentials-stripped-from-offline-verifier",
      "paid-live-environment-stripped-from-offline-verifier",
      "receipt-is-non-self-authorizing",
      "paid-capable-entrypoint-and-cli-hashed",
      "production-cli-dry-run-without-provider-credentials",
      "production-entrypoint-requires-api-key-without-test-injection",
      "mocked-production-entrypoint-qualifies-32k-after-60-trials",
      "attempt-artifacts-and-state-persisted",
      "controller-state-excludes-semantic-correctness-and-raw-response",
      "completed-resume-makes-zero-new-provider-calls",
      "interrupted-resume-reserves-cost-before-replacement",
      "provider-capable-dynamic-import-after-all-cli-guards",
    ],
  }, null, 2));
}

function validOutcome(
  cap: 32000 | 64000
): P63V3RSemReliabilityAuditExecutorOutcome {
  const decision = {
    disposition: "valid-audit-trial" as const,
    responseStatus: "completed",
    incompleteReason: null,
    configuredMaxOutputTokens: cap,
    inputTokens: 1500,
    outputTokens: 500,
    reasoningOutputTokens: 350,
    totalTokens: 2000,
    structureValid: true,
    capUsageMatchedConfiguredLimit: null,
    outputUtilizationRatio: 500 / cap,
    reasoningUtilizationRatio: 350 / cap,
    estimatedCostUsd: 0,
    actualModel: "gpt-5.6-luna",
    responseId: "resp_offline_audit",
    providerErrorCode: null,
    failureReason: null,
  };
  return {
    decision,
    artifact: {
      executorVersion:
        "p6-3-v3-rsem-reliability-audit-executor-v2",
      v3PromptVersion: "p6-3-v3-rsem-fixed-environment-v1",
      v3OutputInstructionsSha256:
        "301aa3b5741c120cf1d749bbde76affa9fd73838097bb8fd4c27310abdbf4323",
      historicalOutputInstructionsSha256: "offline",
      requestBodySha256: "offline",
      fixedEnvironmentIdentity: "offline",
      fixedEnvironment: {} as any,
      rawResponse: JSON.stringify({ offline: "artifact-only" }),
      decision,
      sdkVersion: "offline",
    },
  };
}

function assertEvidencePaths(
  actual: readonly { readonly path: string; readonly sha256: string }[],
  expected: readonly string[]
): void {
  assert.deepEqual(
    actual.map((item) => item.path),
    [...expected]
  );
  for (const item of actual) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
