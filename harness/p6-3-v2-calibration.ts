import * as path from "path";
import {
  authorizeP63V2PaidLiveInvocation,
  buildP63V2CliPreflight,
} from "./src/p6/p6-3-v2-cli-preflight";
import { runP63V2PaidLiveGate } from "./src/p6/p6-3-v2-paid-live-gate";

interface CliArgs {
  live: boolean;
  paidAuthorization: boolean;
  resumePath: string | null;
  adjudicationsPath: string | null;
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
    if (arg === "--authorize-paid-live=P6-3-v2") {
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
    throw new Error(`Unknown P6-3 v2 CLI argument: ${String(arg)}`);
  }

  return { live, paidAuthorization, resumePath, adjudicationsPath };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const preflight = buildP63V2CliPreflight();
  console.log(`P6-3 V2 PRELIVE ${JSON.stringify(preflight)}`);

  if (!args.live) {
    console.log(
      "P6-3 v2 dry preflight passed. Live wiring is present, but paid/provider execution was not requested."
    );
    return;
  }

  // IMPORTANT: create an in-memory branded runtime authorization token before
  // either the paid/live gate or provider-capable entrypoint can be reached.
  const runtimeAuthorization = authorizeP63V2PaidLiveInvocation({
    live: true,
    paidAuthorization: args.paidAuthorization,
    environment: process.env,
  });

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "P6-3 v2 live execution blocked: OPENAI_API_KEY is required after explicit paid/live authorization; no provider calls were made."
    );
  }

  // Re-run the original final offline gate and the additional live-wiring gate
  // on the exact checkout that would perform provider calls. The gate token
  // carries the branded runtime authorization, but its persisted receipt never
  // self-authorizes and remains liveAuthorized=false/providerCallsMade=false.
  const paidLiveToken = runP63V2PaidLiveGate(__dirname, runtimeAuthorization);
  console.log("P6-3 V2 PAID-LIVE GATE", JSON.stringify({
    checkoutGitSha: paidLiveToken.receipt.checkoutGitSha,
    baseVerifierCount:
      paidLiveToken.receipt.baseFinalPreLiveReceipt.verifiers.length,
    wiringVerifierCount: paidLiveToken.receipt.verifiers.length,
    liveExecutionWired: paidLiveToken.receipt.liveExecutionWired,
    liveAuthorized: paidLiveToken.receipt.liveAuthorized,
    providerCallsMade: paidLiveToken.receipt.providerCallsMade,
  }));

  // Provider-capable modules are loaded only after explicit operator signals
  // and both exact-checkout safety gates have succeeded.
  const { runP63V2LiveEntrypoint } = await import(
    "./src/p6/p6-3-v2-live-entrypoint"
  );
  const result = await runP63V2LiveEntrypoint({
    paidLiveToken,
    resumePath: args.resumePath,
    adjudicationsPath: args.adjudicationsPath,
  });

  console.log("P6-3 V2 STATE", JSON.stringify(result.execution));
  console.log("RESULT", result.statePath);
  if (result.finalReportPath) console.log("P6-3 V2 FINAL REPORT", result.finalReportPath);

  if (result.state.status === "needs-audit") {
    console.log(
      "STOP: P6-3 v2 paused in needs-audit. Do not continue until the active attempt is explicitly adjudicated."
    );
  } else if (result.state.status === "needs-design-audit") {
    console.log(
      "STOP: P6-3 v2 collection completed with at least one censored-exhausted cell; B_expose selection remains blocked."
    );
  } else if (result.state.status === "completed") {
    console.log(
      "STOP: P6-3 v2 calibration collection completed. Results remain calibration-only and are not Stage 1A confirmatory evidence."
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
