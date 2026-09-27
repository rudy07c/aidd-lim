import {
  assertP63V2CliInvocationAllowed,
  buildP63V2CliPreflight,
} from "./src/p6/p6-3-v2-cli-preflight";

interface CliArgs {
  live: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let live = false;
  for (const arg of argv) {
    if (arg === "--live") {
      live = true;
      continue;
    }
    throw new Error(`Unknown P6-3 v2 CLI argument: ${arg}`);
  }
  return { live };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const preflight = buildP63V2CliPreflight();
  console.log(`P6-3 V2 PRELIVE ${JSON.stringify(preflight)}`);

  // IMPORTANT: this gate executes before any provider/executor module is
  // imported. The current CLI is intentionally dry-only until the final v2
  // pre-live manifest/gate is frozen in a later change.
  assertP63V2CliInvocationAllowed(args.live);

  console.log(
    "P6-3 v2 dry preflight passed. Live execution remains blocked pending the final v2 pre-live gate."
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
