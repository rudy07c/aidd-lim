// harness/run.ts
// CLIエントリポイント。

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { RunConfig } from "./src/types";
import { runGenerationLoop } from "./src/orchestrator";
import { validateRawRunConfig, validateResolvedRunConfig } from "./src/config/validate";

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

  const parsed: unknown = JSON.parse(fs.readFileSync(absConfigPath, "utf8"));
  // Raw validation happens BEFORE defaults so scientific freeze cannot be satisfied by harness defaults.
  validateRawRunConfig(parsed);
  const rawConfig = parsed;

  const baseRunsDir = rawConfig.runsDir ?? DEFAULT_RUNS_DIR;
  const resolvedRunsDir = smoke ? path.join(baseRunsDir, "_smoke") : rawConfig.stage ? path.join(baseRunsDir, rawConfig.stage) : baseRunsDir;

  const config: RunConfig = {
    ...rawConfig,
    experimentId: rawConfig.experimentId ?? "experiment-unknown",
    lineageId: rawConfig.lineageId ?? "lineage-0",
    backend: rawConfig.backend ?? "mock-noop",
    condition: rawConfig.condition ?? "full",
    contextBudget: rawConfig.contextBudget ?? "full",
    generations: rawConfig.generations ?? 5,
    tasks: rawConfig.tasks ?? ["T-local-1", "T-crosscut-1", "T-delayed-1", "T-invariant-stress-1"],
    maxOutputTokens: rawConfig.maxOutputTokens ?? 8192,
    requestTimeoutMs: rawConfig.requestTimeoutMs ?? 120_000,
    maxRetries: rawConfig.maxRetries ?? 2,
    storeResponses: rawConfig.storeResponses ?? false,
    maxToolRounds: rawConfig.maxToolRounds ?? 4,
    serviceTier: rawConfig.serviceTier ?? "default",
    promptCacheMode: rawConfig.promptCacheMode ?? "implicit",
    syntheticWorldDir: rawConfig.syntheticWorldDir ?? DEFAULT_SYNTHETIC_WORLD_DIR,
    runsDir: resolvedRunsDir,
  };
  validateResolvedRunConfig(config);

  const existingDir = path.join(config.runsDir, config.experimentId);
  if (fs.existsSync(existingDir)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const newExperimentId = `${config.experimentId}__${timestamp}`;
    console.warn(`[run] WARNING: ${config.runsDir}/${config.experimentId}/ already exists.`);
    console.warn(`[run] Auto-renaming to avoid overwrite: ${newExperimentId}`);
    config.experimentId = newExperimentId;
  }

  if (smoke) console.log(`[run] Mode: SMOKE (output → runs/_smoke/)`);
  console.log(`[run] Config: ${absConfigPath}`);
  console.log(`[run] Experiment: ${config.experimentId}`);
  console.log(`[run] Synthetic World: ${config.syntheticWorldDir}`);
  console.log(`[run] Runs Dir: ${config.runsDir}`);

  const result = await runGenerationLoop(config);
  if (result.crashed) {
    console.error(`\n[run] FAILED: invalid/censored after ${result.completedGenerations} valid generations`);
    console.error(`[run] Error: ${result.crashError}`);
    process.exit(1);
  }
  console.log(`\n[run] SUCCESS: ${result.completedGenerations} generations completed.`);
  for (const dir of result.logDirs) console.log(`  ${dir}`);
}

main().catch((e) => {
  console.error("[run] Fatal harness error:", e);
  process.exit(1);
});
