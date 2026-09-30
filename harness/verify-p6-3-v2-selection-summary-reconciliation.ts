import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const resultPath = path.resolve(
  repoRoot,
  "docs/findings/evidence/p6-3-v2-selection-analysis/result.json"
);
const summaryPath = path.resolve(repoRoot, "docs/findings/p6_3_v2_result_summary_ja.md");

function main(): void {
  const durable = JSON.parse(fs.readFileSync(resultPath, "utf8")) as any;
  const summary = fs.readFileSync(summaryPath, "utf8");
  const lines = summary.split("\n");

  for (const arm of durable.arms as any[]) {
    const row = lines.find(
      (candidate) =>
        candidate.startsWith(`| ${arm.arm} | ${arm.budgetTokens} |`) &&
        candidate.includes(` / ${arm.M.total}`) &&
        candidate.includes(` / ${arm.Rsem.total}`)
    );
    assert.ok(row, `current main summary is missing ${arm.arm} result row`);
    assert.ok(
      row.includes(`${arm.M.passCount} / ${arm.M.total}`),
      `${arm.arm}: current summary M count drifted from machine result`
    );
    assert.ok(
      row.includes(`${arm.Rsem.correct} / ${arm.Rsem.total}`),
      `${arm.arm}: current summary Rsem count drifted from machine result`
    );
  }

  assert.ok(summary.includes("qualifyingInteriorArms = []"));
  assert.ok(summary.includes("selectedBExpose = null"));
  assert.ok(summary.includes("selectionStatus = needs-design-audit"));
  assert.ok(summary.includes("reason = NO_CONJUNCTIVE_INTERIOR_BUDGET"));

  console.log("P6-3 v2 current-summary reconciliation verification passed");
}

main();
