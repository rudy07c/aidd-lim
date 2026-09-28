import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import {
  assertP63V2CliInvocationAllowed,
  buildP63V2CliPreflight,
  P6_3_V2_FROZEN_BUDGETS,
} from "./src/p6/p6-3-v2-cli-preflight";

function main(): void {
  const report = buildP63V2CliPreflight();
  assert.equal(report.calibrationOnly, true);
  assert.equal(report.confirmatoryStage1AEligible, false);
  assert.equal(report.totalLogicalCells, 864);
  assert.equal(report.T_EL, 4046);
  assert.equal(report.staticExposureMaxTokensPerUnit, 256);
  assert.deepEqual(report.budgets, P6_3_V2_FROZEN_BUDGETS);
  assert.equal(report.mutationProvider.model, "gpt-5.6-luna");
  assert.equal(report.mutationProvider.reasoningEffort, "high");
  assert.equal(report.mutationProvider.maxOutputTokens, 14000);
  assert.equal(report.rsemProvider.maxOutputTokens, 8000);
  assert.equal(report.maxScientificAttemptsPerLogicalCell, 3);
  assert.equal(report.executionManifestLiveExecutionAuthorized, false);
  assert.equal(report.finalPreLiveGateFrozen, true);
  assert.equal(report.paidLiveAuthorizationRequired, true);
  assert.equal(report.liveExecutionWired, true);
  assert.equal(report.liveExecutionAllowed, false);
  assert.match(report.structuralFreezeSha256, /^[0-9a-f]{64}$/);
  assert.match(report.executionParametersManifestSha256, /^[0-9a-f]{64}$/);
  assert.match(report.v1AutoInfraFixtureSha256, /^[0-9a-f]{64}$/);
  assert.match(report.finalPreLiveSpecSha256, /^[0-9a-f]{64}$/);

  assert.doesNotThrow(() => assertP63V2CliInvocationAllowed({
    live: false,
    paidAuthorization: false,
    environment: {},
  }));
  assert.throws(
    () => assertP63V2CliInvocationAllowed({
      live: true,
      paidAuthorization: false,
      environment: { P6_3_LIVE_EXECUTION_ALLOWED: "1" },
    }),
    /explicit --authorize-paid-live=P6-3-v2 is required/
  );
  assert.throws(
    () => assertP63V2CliInvocationAllowed({
      live: true,
      paidAuthorization: true,
      environment: { P6_3_LIVE_EXECUTION_ALLOWED: "0" },
    }),
    /P6_3_LIVE_EXECUTION_ALLOWED=1 is required/
  );

  const cliPath = path.resolve(__dirname, "p6-3-v2-calibration.ts");
  const cliSource = fs.readFileSync(cliPath, "utf8");
  for (const forbidden of [
    'from "./src/p6/p6-3-v2-live-executors"',
    "OpenAIBackend",
  ]) {
    assert.equal(
      cliSource.includes(forbidden),
      false,
      `CLI must not statically import provider execution surface: ${forbidden}`
    );
  }
  assert.ok(cliSource.includes('await import(\n    "./src/p6/p6-3-v2-live-entrypoint"'));

  const tsNodeRegister = require.resolve("ts-node/register");
  const env = {
    ...process.env,
    OPENAI_API_KEY: "offline-verifier-must-never-use-this",
    P6_3_LIVE_EXECUTION_ALLOWED: "1",
  };
  const dry = spawnSync(process.execPath, ["-r", tsNodeRegister, cliPath], {
    cwd: __dirname,
    env,
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, `dry CLI failed: ${dry.stderr}`);
  assert.match(dry.stdout, /P6-3 V2 PRELIVE/);
  assert.match(dry.stdout, /Live wiring is present/);
  assert.match(dry.stdout, /paid\/provider execution was not requested/);

  const live = spawnSync(
    process.execPath,
    ["-r", tsNodeRegister, cliPath, "--live"],
    {
      cwd: __dirname,
      env,
      encoding: "utf8",
    }
  );
  assert.notEqual(live.status, 0, "--live must fail closed without explicit paid/live authorization flag");
  assert.match(
    `${live.stdout}\n${live.stderr}`,
    /explicit --authorize-paid-live=P6-3-v2 is required; no provider calls were made/
  );

  console.log(JSON.stringify({
    ok: true,
    totalLogicalCells: report.totalLogicalCells,
    mutationMaxOutputTokens: report.mutationProvider.maxOutputTokens,
    rsemMaxOutputTokens: report.rsemProvider.maxOutputTokens,
    finalPreLiveGateFrozen: report.finalPreLiveGateFrozen,
    paidLiveAuthorizationRequired: report.paidLiveAuthorizationRequired,
    liveExecutionWired: report.liveExecutionWired,
    liveExecutionAllowedWithoutRuntimeAuthorization: report.liveExecutionAllowed,
    unauthorizedLiveInvocationFailsClosed: true,
  }));
}

main();
