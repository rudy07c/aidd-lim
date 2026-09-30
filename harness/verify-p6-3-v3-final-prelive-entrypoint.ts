import assert from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  type FixedEnvironmentBinding,
} from "./src/context/fixed-environment-runtime";
import type { P63CellOutcome } from "./src/p6/p6-3-live-calibration-runner";
import {
  P6_3_V3_FINAL_PRELIVE_GATE_VERSION,
  P6_3_V3_FINAL_PRELIVE_RECEIPT_SCHEMA,
  P6_3_V3_FINAL_PRELIVE_VERIFIER_SCRIPTS,
  P6_3_V3_FINAL_SOURCE_FILES,
  runP63V3FinalPreLiveGate,
} from "./src/p6/p6-3-v3-final-prelive-gate";
import { P6_3_V3_RESULT_FINALIZER_VERSION } from "./src/p6/p6-3-v3-result-finalizer";
import { P6_3_V3_RUNTIME_ENVIRONMENT_VERSION } from "./src/p6/p6-3-v3-runtime-environment";
import {
  P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV,
} from "./src/p6/p6-3-v3-live-controller";
import {
  P6_3_V3_LIVE_ENTRYPOINT_VERSION,
  runP63V3LiveEntrypoint,
} from "./src/p6/p6-3-v3-live-entrypoint";

function mockOutcome(args: {
  exposure: any;
  fixedEnvironment: Readonly<FixedEnvironmentBinding>;
  measurement: "M" | "Rsem";
}): P63CellOutcome {
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: args.measurement === "M" ? true : null,
    semanticScore: args.measurement === "Rsem" ? 1 : null,
    protocolValid: true,
    estimatedCostUsd: 0,
    failureReason: null,
    exposure: args.exposure,
    diagnosticSummary: {
      offlineFinalEntrypointVerifier: true,
      fixedEnvironmentIdentity: fixedEnvironmentIdentity(args.fixedEnvironment),
    },
    artifactPayload: {
      offlineFinalEntrypointVerifier: true,
      measurement: args.measurement,
      fixedEnvironment: fixedEnvironmentLogSnapshot(args.fixedEnvironment),
    },
  };
}

async function main(): Promise<void> {
  const harnessRoot = __dirname;
  const token = runP63V3FinalPreLiveGate(harnessRoot);
  const receipt = token.receipt;

  // 1. Final gate is exact-checkout/runtime, non-self-authorizing, and complete.
  assert.equal(receipt.schemaVersion, P6_3_V3_FINAL_PRELIVE_RECEIPT_SCHEMA);
  assert.equal(receipt.gateVersion, P6_3_V3_FINAL_PRELIVE_GATE_VERSION);
  assert.equal(receipt.resultFinalizerVersion, P6_3_V3_RESULT_FINALIZER_VERSION);
  assert.equal(receipt.preflightPassed, true);
  assert.equal(receipt.exactCleanCheckoutVerified, true);
  assert.equal(receipt.runtimeConsumedUntrackedFilesVerified, true);
  assert.equal(receipt.totalLogicalCells, 864);
  assert.equal(receipt.liveAuthorized, false);
  assert.equal(receipt.providerCallsMade, false);
  assert.equal(receipt.runtimeEnvironment.version, P6_3_V3_RUNTIME_ENVIRONMENT_VERSION);
  assert.match(receipt.runtimeEnvironment.nodeVersion, /^v\d+\.\d+\.\d+/);
  assert.match(receipt.runtimeEnvironment.openaiSdkVersion, /^\d+\.\d+\.\d+(?:[-+].*)?$/);
  assert.match(receipt.runtimeEnvironment.packageLockSha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.verifiers.length, P6_3_V3_FINAL_PRELIVE_VERIFIER_SCRIPTS.length);
  assert(receipt.verifiers.every((entry) => entry.status === "pass"));
  const verifierNames = new Set(receipt.verifiers.map((entry) => entry.script));
  for (const required of [
    "verify-package-version.ts",
    "verify-p6-3-v3-validity-propagation.ts",
    "verify-p6-3-v3-result-finalizer.ts",
  ]) {
    assert(verifierNames.has(required), `missing hardened final-gate verifier: ${required}`);
  }
  assert(/^[0-9a-f]{40}$/.test(receipt.checkoutGitSha));
  const sourcePaths = new Set(receipt.sourceEvidence.map((entry) => entry.path));
  for (const required of [
    "harness/package-lock.json",
    "harness/src/p6/p6-3-v3-scientific-validity.ts",
    "harness/src/p6/p6-3-v3-result-finalizer.ts",
    "harness/src/p6/p6-3-v3-runtime-environment.ts",
    "harness/src/p6/p6-3-v3-live-entrypoint.ts",
    "harness/p6-3-v3-finalize.ts",
    "harness/p6-3-v3-calibration.ts",
  ]) {
    assert(sourcePaths.has(required), `missing hardened final-gate source evidence: ${required}`);
  }
  assert.equal(sourcePaths.size, P6_3_V3_FINAL_SOURCE_FILES.length);

  // 2. Production CLI dry-run must complete the same final gate with provider
  // credentials explicitly removed. No provider-capable live path is requested.
  const cliEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV,
  ]) delete cliEnv[key];
  const cli = spawnSync(
    process.execPath,
    ["-r", require.resolve("ts-node/register"), path.join(harnessRoot, "p6-3-v3-calibration.ts")],
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
    `P6-3 v3 dry CLI failed\nstdout:\n${cli.stdout}\nstderr:\n${cli.stderr}`
  );
  assert.match(cli.stdout, /dry preflight passed/);
  assert.match(cli.stdout, /"liveAuthorized":false/);
  assert.match(cli.stdout, /"providerCallsMade":false/);

  // 3. Direct provider-capable entrypoint refuses production mode without an API
  // key when no offline dependency injection exists, before a call is possible.
  await assert.rejects(
    () => runP63V3LiveEntrypoint({
      finalPreLiveToken: token,
      paidAuthorization: true,
      environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
      resumePath: null,
      adjudicationsPath: null,
    }),
    /OPENAI_API_KEY/
  );

  // 4. Exercise the actual entrypoint/persistence/exposure/controller path with
  // only the final M/Rsem scientific executors replaced by mocks.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-v3-entrypoint-verify-"));
  const statePath = path.join(tempRoot, "run", "state.json");
  let mCalls = 0;
  let rsemCalls = 0;
  const bindingRefs = new Set<Readonly<FixedEnvironmentBinding>>();
  try {
    const result = await runP63V3LiveEntrypoint({
      finalPreLiveToken: token,
      paidAuthorization: true,
      environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
      resumePath: null,
      adjudicationsPath: null,
      testDependencies: {
        newStatePath: statePath,
        runStartDependencies: {
          executeMCell: async (args: any) => {
            mCalls += 1;
            bindingRefs.add(args.fixedEnvironment);
            return mockOutcome({
              exposure: args.exposure,
              fixedEnvironment: args.fixedEnvironment,
              measurement: "M",
            });
          },
          executeRSemCell: async (args: any) => {
            rsemCalls += 1;
            bindingRefs.add(args.fixedEnvironment);
            return mockOutcome({
              exposure: args.exposure,
              fixedEnvironment: args.fixedEnvironment,
              measurement: "Rsem",
            });
          },
        },
      },
    });
    assert.equal(result.statePath, statePath);
    assert.equal(result.state.status, "completed");
    assert.equal(result.execution.logicalCellsCompleted, 864);
    assert.equal(mCalls, 792);
    assert.equal(rsemCalls, 72);
    assert.equal(bindingRefs.size, 1);

    const runDir = path.dirname(statePath);
    for (const file of [
      "p6-3-v3-final-prelive-receipt.json",
      "fixed-environment-run.json",
      "treatment-provenance.json",
      "state.json",
    ]) {
      assert(fs.existsSync(path.join(runDir, file)), `missing persisted v3 run file: ${file}`);
    }
    const attemptFiles = fs.readdirSync(path.join(runDir, "attempts"));
    assert.equal(attemptFiles.length, 864, "expected one persisted attempt artifact per logical cell");
    const persistedState = JSON.parse(fs.readFileSync(statePath, "utf8")) as any;
    assert.equal(persistedState.status, "completed");
    assert.equal(persistedState.attempts.length, 864);
    assert.equal(persistedState.interruptedAttempts.length, 0);
    assert.equal(persistedState.checkoutGitSha, receipt.checkoutGitSha);

    // 5. Completed resume verifies all receipts/provenance and makes zero new
    // scientific calls.
    const beforeResumeCalls = mCalls + rsemCalls;
    const resumed = await runP63V3LiveEntrypoint({
      finalPreLiveToken: token,
      paidAuthorization: true,
      environment: { [P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]: "1" },
      resumePath: statePath,
      adjudicationsPath: null,
      testDependencies: {
        runStartDependencies: {
          executeMCell: async (args: any) => {
            mCalls += 1;
            bindingRefs.add(args.fixedEnvironment);
            return mockOutcome({ exposure: args.exposure, fixedEnvironment: args.fixedEnvironment, measurement: "M" });
          },
          executeRSemCell: async (args: any) => {
            rsemCalls += 1;
            bindingRefs.add(args.fixedEnvironment);
            return mockOutcome({ exposure: args.exposure, fixedEnvironment: args.fixedEnvironment, measurement: "Rsem" });
          },
        },
      },
    });
    assert.equal(resumed.state.status, "completed");
    assert.equal(mCalls + rsemCalls, beforeResumeCalls, "completed resume must not make scientific calls");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  // 6. Static CLI ordering: dynamic provider-capable import occurs only after
  // explicit paid flag, v3 env, and API key guards in source order.
  const cliSource = fs.readFileSync(path.join(harnessRoot, "p6-3-v3-calibration.ts"), "utf8");
  const paidGuard = cliSource.indexOf("if (!args.paidAuthorization)");
  const envGuard = cliSource.indexOf(`process.env[P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV]`);
  const apiGuard = cliSource.indexOf("if (!process.env.OPENAI_API_KEY)");
  const dynamicImport = cliSource.indexOf('await import(\n    "./src/p6/p6-3-v3-live-entrypoint"');
  assert(paidGuard >= 0 && envGuard > paidGuard && apiGuard > envGuard && dynamicImport > apiGuard);

  process.stdout.write(JSON.stringify({
    status: "ok",
    gateVersion: P6_3_V3_FINAL_PRELIVE_GATE_VERSION,
    entrypointVersion: P6_3_V3_LIVE_ENTRYPOINT_VERSION,
    resultFinalizerVersion: receipt.resultFinalizerVersion,
    checkoutGitSha: receipt.checkoutGitSha,
    runtimeEnvironment: receipt.runtimeEnvironment,
    verifierCount: receipt.verifiers.length,
    sourceEvidenceCount: receipt.sourceEvidence.length,
    logicalCells: 864,
    mMockCalls: mCalls,
    rsemMockCalls: rsemCalls,
    identicalBindingObjectCount: bindingRefs.size,
    persistedAttemptArtifacts: 864,
    completedResumeAdditionalScientificCalls: 0,
    providerCalls: 0,
    actualPaidLiveRunPerformed: false,
    verified: [
      "exact-clean-checkout-final-gate",
      "runtime-consumed-untracked-ts-rejected",
      "installed-openai-sdk-package-lock-parity",
      "runtime-dependency-provenance-in-receipt",
      "rsem-validity-propagation-verifier-in-final-gate",
      "result-finalizer-verifier-in-final-gate",
      "all-v3-offline-verifiers-pass",
      "entrypoint-finalizer-and-cli-hashes-in-gate-receipt",
      "production-cli-dry-run-without-provider-credentials",
      "production-entrypoint-requires-api-key-without-test-injection",
      "mocked-production-entrypoint-completes-864-cells",
      "prelive-fixed-environment-treatment-state-persist-before-and-during-run",
      "one-attempt-artifact-per-logical-cell",
      "completed-resume-verifies-provenance-with-zero-new-calls",
      "provider-capable-dynamic-import-after-all-cli-guards",
    ],
  }, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
