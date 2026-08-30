// harness/run.ts
// CLIエントリポイント。
//
// 使用方法:
//   ts-node run.ts --config config/stage0-mock.json
//   ts-node run.ts --config config/stage0-real.json
//   ts-node run.ts --config config/stage0-mock.json --smoke   # runs/_smoke/ に出力
//
// 設定ファイル（JSON）のスキーマは RunConfig に準拠。
// syntheticWorldDir / runsDir は省略時はこのファイルを基準に自動解決する。
// --smoke フラグを付けると出力先が runs/_smoke/ になり、動作確認ログを本番と分離できる。
// --smoke なしの場合は、config の stage フィールドに従って runs/<stage>/ に出力する。
//
// APIキーは harness/.env に ANTHROPIC_API_KEY=sk-ant-... として設定する。
// dotenv が自動的に読み込む（.env は .gitignore されているため誤push不可）。

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { RunConfig } from "./src/types";
import { runGenerationLoop } from "./src/orchestrator";

const HARNESS_DIR = __dirname;
const REPO_ROOT = path.dirname(HARNESS_DIR);
const DEFAULT_SYNTHETIC_WORLD_DIR = path.join(REPO_ROOT, "synthetic-world");
const DEFAULT_RUNS_DIR = path.join(REPO_ROOT, "runs");

function parseArgs(): { configPath: string; smoke: boolean } {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf("--config");
  if (configIdx === -1 || !args[configIdx + 1]) {
    console.error("Usage: ts-node run.ts --config <path-to-config.json> [--smoke]");
    process.exit(1);
  }
  return { configPath: args[configIdx + 1], smoke: args.includes("--smoke") };
}

async function main(): Promise<void> {
  const { configPath, smoke } = parseArgs();

  const absConfigPath = path.resolve(HARNESS_DIR, configPath);
  if (!fs.existsSync(absConfigPath)) {
    console.error(`Config file not found: ${absConfigPath}`);
    process.exit(1);
  }

  const rawConfig = JSON.parse(fs.readFileSync(absConfigPath, "utf8")) as Partial<RunConfig>;

  // syntheticWorldDir / runsDir の解決（設定ファイルに絶対パスがない場合はデフォルトを使用）
  const baseRunsDir = rawConfig.runsDir ?? DEFAULT_RUNS_DIR;

  // --smoke → runs/_smoke/、それ以外は config の stage フィールドに従って runs/<stage>/
  const resolvedRunsDir = smoke
    ? path.join(baseRunsDir, "_smoke")
    : rawConfig.stage
    ? path.join(baseRunsDir, rawConfig.stage)
    : baseRunsDir;

  const config: RunConfig = {
    ...rawConfig,
    experimentId: rawConfig.experimentId ?? "experiment-unknown",
    lineageId: rawConfig.lineageId ?? "lineage-0",
    backend: rawConfig.backend ?? "mock-noop",
    condition: rawConfig.condition ?? "full",
    contextBudget: rawConfig.contextBudget ?? "full",
    generations: rawConfig.generations ?? 5,
    tasks: rawConfig.tasks ?? ["T-local-1", "T-crosscut-1", "T-delayed-1", "T-invariant-stress-1"],
    syntheticWorldDir: rawConfig.syntheticWorldDir ?? DEFAULT_SYNTHETIC_WORLD_DIR,
    runsDir: resolvedRunsDir,
  };

  // 同じ experimentId のディレクトリが既に存在する場合、タイムスタンプ付きの別 ID に退避する。
  // 気づかないうちに過去の実行結果が上書きされることを防ぐ。
  const existingDir = path.join(config.runsDir, config.experimentId);
  if (fs.existsSync(existingDir)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const newExperimentId = `${config.experimentId}__${timestamp}`;
    console.warn(`[run] WARNING: ${config.runsDir}/${config.experimentId}/ already exists.`);
    console.warn(`[run] Auto-renaming to avoid overwrite: ${newExperimentId}`);
    config.experimentId = newExperimentId;
  }

  if (smoke) {
    console.log(`[run] Mode: SMOKE (output → runs/_smoke/)`);
  }
  console.log(`[run] Config: ${absConfigPath}`);
  console.log(`[run] Experiment: ${config.experimentId}`);
  console.log(`[run] Synthetic World: ${config.syntheticWorldDir}`);
  console.log(`[run] Runs Dir: ${config.runsDir}`);

  const result = await runGenerationLoop(config);

  if (result.crashed) {
    console.error(`\n[run] FAILED: crashed at generation ${result.completedGenerations}`);
    console.error(`[run] Error: ${result.crashError}`);
    process.exit(1);
  }

  console.log(`\n[run] SUCCESS: ${result.completedGenerations} generations completed.`);
  console.log(`[run] Log directories:`);
  for (const dir of result.logDirs) {
    console.log(`  ${dir}`);
  }
}

main().catch((e) => {
  console.error("[run] Fatal error:", e);
  process.exit(1);
});
