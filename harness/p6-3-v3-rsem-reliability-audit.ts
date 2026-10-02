import * as path from "path";
import {
  runP63V3RSemReliabilityAuditFinalPreLiveGate,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-final-prelive-gate";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_FLAG,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-controller";

interface CliArgs {
  readonly live: boolean;
  readonly paidAuthorization: boolean;
  readonly resumePath: string | null;
  readonly adjudicationPath: string | null;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let live = false;
  let paidAuthorization = false;
  let resumePath: string | null = null;
  let adjudicationPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live") {
      live = true;
      continue;
    }
    if (arg === P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_FLAG) {
      paidAuthorization = true;
      continue;
    }
    if (arg === "--resume" || arg === "--adjudication") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      const resolved = path.resolve(process.cwd(), value);
      if (arg === "--resume") resumePath = resolved;
      else adjudicationPath = resolved;
      index += 1;
      continue;
    }
    throw new Error(
      `Unknown P6-3 v3 Rsem reliability audit CLI argument: ${String(arg)}`
    );
  }

  return {
    live,
    paidAuthorization,
    resumePath,
    adjudicationPath,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const finalPreLiveToken =
    runP63V3RSemReliabilityAuditFinalPreLiveGate(__dirname);
  const receipt = finalPreLiveToken.receipt;

  console.log(
    "P6-3 V3 RSEM RELIABILITY AUDIT FINAL PRELIVE",
    JSON.stringify({
      checkoutGitSha: receipt.checkoutGitSha,
      candidateCaps: receipt.candidateCaps,
      plannedValidTrialCeiling: receipt.plannedValidTrialCeiling,
      providerAttemptCeiling: receipt.providerAttemptCeiling,
      operationalCostCeilingUsd: receipt.operationalCostCeilingUsd,
      exactCleanCheckoutVerified: receipt.exactCleanCheckoutVerified,
      liveAuthorized: receipt.liveAuthorized,
      providerCallsMade: receipt.providerCallsMade,
    })
  );

  if (!args.live) {
    console.log(
      "P6-3 v3 Rsem reliability audit dry preflight passed. No provider call was requested."
    );
    return;
  }

  if (!args.paidAuthorization) {
    throw new Error(
      `Rsem reliability audit live execution blocked: explicit ${P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_FLAG} is required; no provider calls were made.`
    );
  }
  if (
    process.env[P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV] !== "1"
  ) {
    throw new Error(
      `Rsem reliability audit live execution blocked: ${P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV}=1 is required; no provider calls were made.`
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "Rsem reliability audit live execution blocked: OPENAI_API_KEY is required after explicit paid/live authorization; no provider calls were made."
    );
  }

  // Load provider-capable entrypoint only after final pre-live and all explicit
  // paid/provider guards have passed.
  const { runP63V3RSemReliabilityAuditLiveEntrypoint } = await import(
    "./src/p6/p6-3-v3-rsem-reliability-audit-live-entrypoint"
  );
  const result = await runP63V3RSemReliabilityAuditLiveEntrypoint({
    finalPreLiveToken,
    paidAuthorization: args.paidAuthorization,
    environment: process.env,
    resumePath: args.resumePath,
    adjudicationPath: args.adjudicationPath,
  });

  console.log(
    "P6-3 V3 RSEM RELIABILITY AUDIT STATE",
    JSON.stringify(result.execution)
  );
  console.log("RESULT", result.statePath);

  if (result.state.status === "needs-audit") {
    console.log(
      "STOP: reliability audit paused in needs-audit. Resolve the active audit flag before any replacement call."
    );
  } else if (result.state.status === "needs-design-audit") {
    console.log(
      "STOP: 64k hard audit cap was rejected. Automatic escalation to 128k is prohibited."
    );
  } else if (result.state.status === "completed") {
    console.log(
      `STOP: reliability audit qualified maxOutputTokens=${String(result.state.selectedMaxOutputTokens)}. This is execution-reliability evidence only and is not scientific Rsem evidence.`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
