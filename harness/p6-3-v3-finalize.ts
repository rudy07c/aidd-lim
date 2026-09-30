import * as fs from "fs";
import * as path from "path";
import type { P63V3LiveCalibrationState } from "./src/p6/p6-3-v3-live-controller";
import { finalizeP63V3Calibration } from "./src/p6/p6-3-v3-result-finalizer";

interface CliArgs {
  readonly statePath: string;
  readonly outputPath: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let statePath: string | null = null;
  let outputPath: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--state" && arg !== "--output") {
      throw new Error(`Unknown P6-3 v3 finalizer argument: ${String(arg)}`);
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`${arg} requires a path`);
    const resolved = path.resolve(process.cwd(), value);
    if (arg === "--state") statePath = resolved;
    else outputPath = resolved;
    index += 1;
  }
  if (!statePath) throw new Error("P6-3 v3 finalizer requires --state <state.json>");
  return {
    statePath,
    outputPath: outputPath ?? path.join(path.dirname(statePath), "result.json"),
  };
}

function writeJsonImmutableOrSame(target: string, value: unknown): void {
  const next = JSON.stringify(value, null, 2) + "\n";
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, "utf8");
    if (current !== next) {
      throw new Error(`P6-3 v3 immutable final result already exists with different content: ${target}`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, next, "utf8");
  fs.renameSync(tmp, target);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.statePath) || !fs.statSync(args.statePath).isFile()) {
    throw new Error(`P6-3 v3 finalizer state file does not exist: ${args.statePath}`);
  }
  const state = JSON.parse(
    fs.readFileSync(args.statePath, "utf8")
  ) as P63V3LiveCalibrationState;
  const result = finalizeP63V3Calibration(state);
  writeJsonImmutableOrSame(args.outputPath, result);
  console.log("P6-3 V3 FINAL RESULT", JSON.stringify({
    status: result.selection.status,
    selectedArm: result.selection.selectedArm,
    selectedBExpose: result.selection.selectedBExpose,
    reason: result.selection.reason,
    validScientificObservations: result.integrity.validScientificObservations,
    output: args.outputPath,
  }));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
