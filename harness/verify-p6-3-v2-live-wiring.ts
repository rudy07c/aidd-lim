import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { assertP63V2CliInvocationAllowed } from "./src/p6/p6-3-v2-cli-preflight";

function main(): void {
  const cliPath = path.resolve(__dirname, "p6-3-v2-calibration.ts");
  const entrypointPath = path.resolve(__dirname, "src/p6/p6-3-v2-live-entrypoint.ts");
  const paidGatePath = path.resolve(__dirname, "src/p6/p6-3-v2-paid-live-gate.ts");
  const cliSource = fs.readFileSync(cliPath, "utf8");
  const entrypointSource = fs.readFileSync(entrypointPath, "utf8");
  const paidGateSource = fs.readFileSync(paidGatePath, "utf8");

  assert.equal(/^import .*p6-3-v2-live-entrypoint/m.test(cliSource), false);
  assert.equal(cliSource.includes('from "./src/p6/p6-3-v2-live-executors"'), false);
  assert.equal(cliSource.includes("OpenAIBackend"), false);
  assert.equal(paidGateSource.includes('from "./p6-3-v2-live-executors"'), false);
  assert.equal(paidGateSource.includes("OpenAIBackend"), false);

  const guardIndex = cliSource.indexOf("assertP63V2CliInvocationAllowed({");
  const paidGateIndex = cliSource.indexOf("runP63V2PaidLiveGate(__dirname)");
  const dynamicImportIndex = cliSource.indexOf('await import(\n    "./src/p6/p6-3-v2-live-entrypoint"');
  assert.ok(guardIndex >= 0, "CLI must invoke the paid/live guard");
  assert.ok(paidGateIndex > guardIndex, "layered exact-checkout paid/live gate must run after authorization guard");
  assert.ok(dynamicImportIndex > paidGateIndex, "provider-capable entrypoint must load only after paid/live gate");

  for (const required of [
    "assertP63V2PaidLiveGatePassToken",
    "loadP63V2FrozenRuntimeInputs",
    "createP63V2ProviderExecutor",
    "runP63V2EndToEnd",
    "recoverInterruptedP63V2State",
  ]) {
    assert.ok(entrypointSource.includes(required), `live entrypoint missing required wiring: ${required}`);
  }
  assert.ok(paidGateSource.includes("runP63V2FinalPreLiveGate"));
  assert.ok(paidGateSource.includes("liveAuthorized: false"));
  assert.ok(paidGateSource.includes("providerCallsMade: false"));

  assert.throws(
    () => assertP63V2CliInvocationAllowed({ live: true, paidAuthorization: false, environment: { P6_3_LIVE_EXECUTION_ALLOWED: "1" } }),
    /explicit --authorize-paid-live=P6-3-v2 is required/
  );
  assert.throws(
    () => assertP63V2CliInvocationAllowed({ live: true, paidAuthorization: true, environment: { P6_3_LIVE_EXECUTION_ALLOWED: "0" } }),
    /P6_3_LIVE_EXECUTION_ALLOWED=1 is required/
  );
  assert.doesNotThrow(() => assertP63V2CliInvocationAllowed({
    live: true,
    paidAuthorization: true,
    environment: { P6_3_LIVE_EXECUTION_ALLOWED: "1" },
  }));

  const tsNodeRegister = require.resolve("ts-node/register");
  const baseEnv = {
    ...process.env,
    OPENAI_API_KEY: "offline-live-wiring-verifier-must-never-use-this",
  };

  const missingFlag = spawnSync(
    process.execPath,
    ["-r", tsNodeRegister, cliPath, "--live"],
    {
      cwd: __dirname,
      env: { ...baseEnv, P6_3_LIVE_EXECUTION_ALLOWED: "1" },
      encoding: "utf8",
    }
  );
  assert.notEqual(missingFlag.status, 0);
  assert.match(`${missingFlag.stdout}\n${missingFlag.stderr}`, /explicit --authorize-paid-live=P6-3-v2 is required/);

  const missingEnv = spawnSync(
    process.execPath,
    ["-r", tsNodeRegister, cliPath, "--live", "--authorize-paid-live=P6-3-v2"],
    {
      cwd: __dirname,
      env: { ...baseEnv, P6_3_LIVE_EXECUTION_ALLOWED: "0" },
      encoding: "utf8",
    }
  );
  assert.notEqual(missingEnv.status, 0);
  assert.match(`${missingEnv.stdout}\n${missingEnv.stderr}`, /P6_3_LIVE_EXECUTION_ALLOWED=1 is required/);

  console.log(JSON.stringify({
    ok: true,
    providerImportIsDynamic: true,
    authorizationGuardPrecedesPaidLiveGate: true,
    paidLiveGatePrecedesProviderImport: true,
    baseFinalGateIsLayeredUnderPaidLiveGate: true,
    missingFlagFailsClosed: true,
    missingEnvironmentAuthorizationFailsClosed: true,
    providerCallsMade: false,
  }));
}

main();
