import * as fs from "fs";
import * as path from "path";
import {
  finalizeP63V3RSemCompletion,
} from "./src/p6/p6-3-v3-rsem-completion-finalizer";
import type {
  P63V3RSemCompletionState,
} from "./src/p6/p6-3-v3-rsem-completion-controller";

interface CliArgs {
  readonly statePath: string;
  readonly outputPath: string | null;
}

function parseArgs(
  argv: readonly string[]
): CliArgs {
  let statePath: string | null = null;
  let outputPath: string | null = null;

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];
    if (
      arg === "--state" ||
      arg === "--out"
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(
          `${arg} requires a path`
        );
      }
      const resolved = path.resolve(
        process.cwd(),
        value
      );
      if (arg === "--state") {
        statePath = resolved;
      } else {
        outputPath = resolved;
      }
      index += 1;
      continue;
    }
    throw new Error(
      `Unknown P6-3 v3 Rsem completion finalizer argument: ${String(arg)}`
    );
  }

  if (!statePath) {
    throw new Error(
      "--state is required"
    );
  }
  return { statePath, outputPath };
}

function main(): void {
  const args = parseArgs(
    process.argv.slice(2)
  );
  if (
    !fs.existsSync(args.statePath) ||
    !fs.statSync(args.statePath).isFile()
  ) {
    throw new Error(
      `Fresh Rsem completion state file does not exist: ${args.statePath}`
    );
  }

  const state = JSON.parse(
    fs.readFileSync(args.statePath, "utf8")
  ) as P63V3RSemCompletionState;
  const repoRoot = path.resolve(
    __dirname,
    ".."
  );
  const result =
    finalizeP63V3RSemCompletion({
      repoRoot,
      freshRSemState: state,
    });

  const outputPath =
    args.outputPath ??
    path.join(
      path.dirname(args.statePath),
      "split-provenance-result.json"
    );
  const serialized =
    JSON.stringify(result, null, 2) + "\n";

  if (fs.existsSync(outputPath)) {
    const existing = fs.readFileSync(
      outputPath,
      "utf8"
    );
    if (existing !== serialized) {
      throw new Error(
        `Existing split-provenance result differs from deterministic finalization: ${outputPath}`
      );
    }
  } else {
    writeAtomic(outputPath, serialized);
  }

  console.log(
    "P6-3 V3 RSEM COMPLETION FINALIZED",
    JSON.stringify({
      status:
        result.selection.status,
      selectedArm:
        result.selection.selectedArm,
      selectedBExpose:
        result.selection
          .selectedBExpose,
      reason:
        result.selection.reason,
      combinedLogicalCells:
        result.integrity
          .combinedLogicalCells,
      inheritedMValidObservations:
        result.integrity
          .inheritedMValidObservations,
      freshRSemValidObservations:
        result.integrity
          .freshRSemValidObservations,
    })
  );
  console.log("RESULT", outputPath);
}

function writeAtomic(
  target: string,
  content: string
): void {
  fs.mkdirSync(path.dirname(target), {
    recursive: true,
  });
  const temporary =
    `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(
    temporary,
    content,
    "utf8"
  );
  fs.renameSync(temporary, target);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : String(error)
  );
  process.exitCode = 1;
}
