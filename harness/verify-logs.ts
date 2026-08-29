// harness/verify-logs.ts
// ログ欠損チェックスクリプト。（docs/harness_stage0_plan.md Phase 4, ステップ13）
//
// 各generation_NNN/ ディレクトリに必須フィールドが揃っているかを検証する。
//
// 使用方法:
//   ts-node verify-logs.ts --experiment <experiment_id> [--runs-dir <path>]
//   ts-node verify-logs.ts --all [--runs-dir <path>]

import * as fs from "fs";
import * as path from "path";

const HARNESS_DIR = __dirname;
const REPO_ROOT = path.dirname(HARNESS_DIR);
const DEFAULT_RUNS_DIR = path.join(REPO_ROOT, "runs");

// generation_NNN/ ディレクトリに必要なファイル
const REQUIRED_FILES = [
  "meta.json",
  "context_contents.json",
  "agent_prompt.json",
  "agent_response.json",
  "visible_test_results.json",
  "hidden_test_results.json",
  "git_diff.patch",
  "repository_before",
  "repository_after",
];

// meta.json に必要なフィールド
const REQUIRED_META_FIELDS = [
  "experiment_id",
  "lineage_id",
  "generation",
  "condition",
  "model",
  "task_id",
  "context_budget",
  "actual_context_tokens",
  "functional_task_result",
  "latency_ms",
  "protocol_contract_violated",
];

interface VerificationResult {
  experimentId: string;
  lineageId: string;
  generation: number;
  ok: boolean;
  errors: string[];
}

function parseArgs(): { experimentId?: string; all: boolean; runsDir: string } {
  const args = process.argv.slice(2);
  const expIdx = args.indexOf("--experiment");
  const allFlag = args.includes("--all");
  const runsDirIdx = args.indexOf("--runs-dir");

  return {
    experimentId: expIdx !== -1 ? args[expIdx + 1] : undefined,
    all: allFlag,
    runsDir: runsDirIdx !== -1 ? args[runsDirIdx + 1] : DEFAULT_RUNS_DIR,
  };
}

function verifyGeneration(genDir: string, experimentId: string, lineageId: string): VerificationResult {
  const genName = path.basename(genDir);
  const genNum = parseInt(genName.replace("generation_", ""), 10);
  const errors: string[] = [];

  // 必須ファイル/ディレクトリの存在確認
  for (const required of REQUIRED_FILES) {
    const filePath = path.join(genDir, required);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing: ${required}`);
    }
  }

  // meta.json のフィールド確認
  const metaPath = path.join(genDir, "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
      for (const field of REQUIRED_META_FIELDS) {
        if (!(field in meta)) {
          errors.push(`meta.json missing field: ${field}`);
        }
      }
    } catch (e) {
      errors.push(`meta.json parse error: ${e}`);
    }
  }

  // repository_before / repository_after が空でないか確認
  for (const dir of ["repository_before", "repository_after"]) {
    const dirPath = path.join(genDir, dir);
    if (fs.existsSync(dirPath)) {
      const files = getAllFiles(dirPath);
      if (files.length === 0) {
        errors.push(`${dir}/ is empty`);
      }
    }
  }

  // テスト結果のJSONが有効か確認
  for (const jsonFile of ["visible_test_results.json", "hidden_test_results.json"]) {
    const filePath = path.join(genDir, jsonFile);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
        if (!("passed" in data)) {
          errors.push(`${jsonFile} missing "passed" field`);
        }
        if (!("numPassed" in data)) {
          errors.push(`${jsonFile} missing "numPassed" field`);
        }
        if (!("numFailed" in data)) {
          errors.push(`${jsonFile} missing "numFailed" field`);
        }
      } catch (e) {
        errors.push(`${jsonFile} parse error: ${e}`);
      }
    }
  }

  return {
    experimentId,
    lineageId,
    generation: genNum,
    ok: errors.length === 0,
    errors,
  };
}

function verifyExperiment(experimentDir: string): VerificationResult[] {
  const results: VerificationResult[] = [];
  const experimentId = path.basename(experimentDir);

  if (!fs.existsSync(experimentDir)) {
    console.error(`Experiment directory not found: ${experimentDir}`);
    return results;
  }

  for (const lineageName of fs.readdirSync(experimentDir)) {
    const lineageDir = path.join(experimentDir, lineageName);
    if (!fs.statSync(lineageDir).isDirectory()) continue;

    const genDirs = fs
      .readdirSync(lineageDir)
      .filter((d) => d.startsWith("generation_"))
      .sort()
      .map((d) => path.join(lineageDir, d));

    for (const genDir of genDirs) {
      if (!fs.statSync(genDir).isDirectory()) continue;
      results.push(verifyGeneration(genDir, experimentId, lineageName));
    }
  }

  return results;
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function printResults(results: VerificationResult[]): void {
  let totalOk = 0;
  let totalFailed = 0;

  for (const r of results) {
    const status = r.ok ? "OK" : "FAIL";
    console.log(`[${status}] ${r.experimentId}/${r.lineageId}/generation_${String(r.generation).padStart(3, "0")}`);
    for (const err of r.errors) {
      console.log(`       ERROR: ${err}`);
    }
    if (r.ok) totalOk++;
    else totalFailed++;
  }

  console.log(`\nSummary: ${totalOk} OK, ${totalFailed} FAILED out of ${results.length} generations.`);
}

function main(): void {
  const { experimentId, all, runsDir } = parseArgs();

  if (!fs.existsSync(runsDir)) {
    console.error(`Runs directory not found: ${runsDir}`);
    process.exit(1);
  }

  const results: VerificationResult[] = [];

  if (all) {
    for (const expName of fs.readdirSync(runsDir)) {
      const expDir = path.join(runsDir, expName);
      if (fs.statSync(expDir).isDirectory()) {
        results.push(...verifyExperiment(expDir));
      }
    }
  } else if (experimentId) {
    const expDir = path.join(runsDir, experimentId);
    results.push(...verifyExperiment(expDir));
  } else {
    console.error("Specify --experiment <id> or --all");
    console.error("Usage: ts-node verify-logs.ts --experiment <experiment_id> [--runs-dir <path>]");
    console.error("       ts-node verify-logs.ts --all [--runs-dir <path>]");
    process.exit(1);
  }

  if (results.length === 0) {
    console.log("No generation logs found.");
    process.exit(0);
  }

  printResults(results);

  const anyFailed = results.some((r) => !r.ok);
  process.exit(anyFailed ? 1 : 0);
}

main();
