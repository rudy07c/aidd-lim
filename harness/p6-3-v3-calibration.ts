import * as path from "path";
import { runP63V3FinalPreLiveGate } from "./src/p6/p6-3-v3-final-prelive-gate";
import {
  P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV,
  P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG,
} from "./src/p6/p6-3-v3-live-controller";

interface CliArgs {
  readonly live: boolean;
  readonly paidAuthorization: boolean;
  readonly resumePath: string | null;
  readonly adjudicationsPath: string | null;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let live = false;
  let paidAuthorization = false;
  let resumePath: string | null = null;
  let adjudicationsPath: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG) {
      paidAuthorization = true;
      continue;
    }
    if (arg === "--resume" || arg === "--adjudications") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      const resolved = path.resolve(process.cwd(), value);
      if (arg === "--resume") resumePath = resolved;
      else adjudicationsPath = resolved;
      index += 1;
      continue;
    }
    throw new Error(`Unknown P6-3 v3 CLI argument: ${String(arg)}`);
  }
  return { live, paidAuthorization, resumePath, adjudicationsPath };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const finalPreLiveToken = runP63V3FinalPreLiveGate(__dirname);
  const receipt = finalPreLiveToken.receipt;
  console.log("P6-3 V3 FINAL PRELIVE", JSON.stringify({
    checkoutGitSha: receipt.checkoutGitSha,
    verifierCount: receipt.verifiers.length,
    totalLogicalCells: receipt.totalLogicalCells,
    predeclarationVersion: receipt.predeclarationVersion,
    finalSelectorVersion: receipt.finalSelectorVersion,
    liveControllerVersion: receipt.liveControllerVersion,
    exactCleanCheckoutVerified: receipt.exactCleanCheckoutVerified,
    liveAuthorized: receipt.liveAuthorized,
    providerCallsMade: receipt.providerCallsMade,
  }));

  if (!args.live) {
    console.log(
      "P6-3 v3 dry preflight passed. Provider-capable wiring exists, but paid/live execution was not requested."
    );
    return;
  }

  if (!args.paidAuthorization) {
    throw new Error(
      `P6-3 v3 live execution blocked: explicit ${P6_3_V3_PAID_LIVE_AUTHORIZATION_FLAG} is required; no provider calls were made.`
    );
  }
  if (process.env[P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV] !== "1") {
    throw new Error(
      `P6-3 v3 live execution blocked: ${P6_3_V3_PAID_LIVE_AUTHORIZATION_ENV}=1 is required; no provider calls were made.`
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "P6-3 v3 live execution blocked: OPENAI_API_KEY is required after explicit paid/live authorization; no provider calls were made."
    );
  }

  // Provider-capable module is loaded only after the complete exact-checkout
  // gate and all explicit operator/provider credentials have been established.
  const { runP63V3LiveEntrypoint } = await import(
    "./src/p6/p6-3-v3-live-entrypoint"
  );
  const result = await runP63V3LiveEntrypoint({
    finalPreLiveToken,
    paidAuthorization: args.paidAuthorization,
    environment: process.env,
    resumePath: args.resumePath,
    adjudicationsPath: args.adjudicationsPath,
  });

  console.log("P6-3 V3 STATE", JSON.stringify(result.execution));
  console.log("RESULT", result.statePath);
  if (result.state.status === "needs-audit") {
    console.log(
      "STOP: P6-3 v3 paused in needs-audit. No replacement provider call is allowed until the active attempt is explicitly adjudicated."
    );
  } else if (result.state.status === "completed") {
    console.log(
      "STOP: P6-3 v3 calibration collection completed. Apply the already-predeclared M/Rsem co-gate separately; results remain calibration-only."
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
