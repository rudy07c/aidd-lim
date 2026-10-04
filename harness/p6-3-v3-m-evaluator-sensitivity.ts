import * as fs from "fs";
import * as path from "path";
import {
  runCorrectedMEvaluatorSensitivity,
} from "./src/p6/p6-3-v3-m-evaluator-sensitivity";

async function main(): Promise<void> {
  const scope = process.argv.includes("--full") ? "full" : "proof";
  const out = readArg("--out");
  const repoRoot = path.resolve(__dirname, "..");

  const report = await runCorrectedMEvaluatorSensitivity({
    repoRoot,
    scope,
  });

  if (out) {
    const target = path.resolve(process.cwd(), out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: report.schemaVersion,
        analysisClass: report.analysisClass,
        primaryEvidenceMutated: report.primaryEvidenceMutated,
        providerCallsMade: report.providerCallsMade,
        evaluator: report.evaluator,
        scope: report.scope,
        selectedSequences: report.selectedSequences,
        summary: report.summary,
        rows: report.scope === "proof" ? report.rows : undefined,
        reportWrittenTo: out ? path.resolve(process.cwd(), out) : null,
      },
      null,
      2
    ) + "\n"
  );
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
