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
  assert.equal(report.finalPreLiveGateFrozen, false);
  assert.equal(report.liveExecutionAllowed, false);
  assert.match(report.structuralFreezeSha256, /^[0-9a-f]{64}$/);
  assert.match(report.executionParametersManifestSha256, /^[0-9a-f]{64}$/);
  assert.match(report.v1AutoInfraFixtureSha256, /^[0-9a-f]{64}$/);

  assert.doesNotThrow(() => assertP63V2CliInvocationAllowed(false));
  assert.throws(
    () => assertP63V2CliInvocationAllowed(true),
    /live execution blocked: final pre-live gate is not frozen/
  );

  const cliPath = path.resolve(__dirname, "p6-3-v2-calibration.ts");
  const cliSource = fs.readFileSync(cliPath, "utf8");
  for (const forbidden of [
    "p6-3-v2-live-executors",
    "OpenAIBackend",
    "OPENAI_API_KEY",
    "executeP63V2Calibration",
  ]) {
    assert.equal(
      cliSource.includes(forbidden),
      false,
      `dry-only CLI must not import/use provider execution surface: ${forbidden}`
    );
  }

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
  assert.match(dry.stdout, /Live execution remains blocked/);

  const live = spawnSync(
    process.execPath,
    ["-r", tsNodeRegister, cliPath, "--live"],
    {
      cwd: __dirname,
      env,
      encoding: "utf8",
    }
  );
  assert.notEqual(live.status, 0, "--live must fail closed before final v2 pre-live gate");
  assert.match(
    `${live.stdout}\n${live.stderr}`,
    /live execution blocked: final pre-live gate is not frozen; no provider calls were made/
  );

  console.log(JSON.stringify({
    ok: true,
    totalLogicalCells: report.totalLogicalCells,
    mutationMaxOutputTokens: report.mutationProvider.maxOutputTokens,
    rsemMaxOutputTokens: report.rsemProvider.maxOutputTokens,
    finalPreLiveGateFrozen: report.finalPreLiveGateFrozen,
    liveExecutionAllowed: report.liveExecutionAllowed,
    liveInvocationFailsClosed: true,
  }));
}

main();
