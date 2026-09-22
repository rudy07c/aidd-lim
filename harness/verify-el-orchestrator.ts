import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runGenerationLoop } from "./src/orchestrator";
import type { ELRuntimeConfig } from "./src/context/el-static-exposure-runtime";
import { countStaticRepositoryPayloadTokens } from "./src/context/static-exposure";

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repository = loadRepositoryFiles(path.join(syntheticWorldDir, "repository"));
  const fullTokens = countStaticRepositoryPayloadTokens(repository);
  const runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-el-orchestrator-"));

  try {
    const config: ELRuntimeConfig = {
      experimentId: "verify-el-orchestrator",
      lineageId: "lineage-0",
      runClass: "smoke",
      backend: "mock-noop",
      condition: "EL",
      contextBudget: Math.floor(fullTokens / 2),
      staticExposureMaxTokensPerUnit: 256,
      generations: 1,
      tasks: ["T-crosscut-1"],
      syntheticWorldDir,
      runsDir,
    };

    const result = await runGenerationLoop(config);
    assert.strictEqual(result.crashed, false, result.crashError);
    assert.strictEqual(result.completedGenerations, 1);
    assert.strictEqual(result.logDirs.length, 1);

    const logDir = result.logDirs[0];
    const exposurePath = path.join(logDir, "el_static_exposure.json");
    assert(fs.existsSync(exposurePath), "EL generation must persist static exposure provenance");
    assert(!fs.existsSync(path.join(logDir, "retrieved_episode.json")), "EL must not use PR/AR retrieval runtime");

    const exposure = JSON.parse(fs.readFileSync(exposurePath, "utf8"));
    const meta = JSON.parse(fs.readFileSync(path.join(logDir, "meta.json"), "utf8"));
    const context = JSON.parse(fs.readFileSync(path.join(logDir, "context_contents.json"), "utf8"));

    assert.strictEqual(exposure.selectorKind, "task-privileged-ranking");
    assert.strictEqual(exposure.budgetTokens, config.contextBudget);
    assert(exposure.selectedUnitCount > 0);
    assert(exposure.selectedUnitCount < exposure.orderedUnitCount);
    assert.strictEqual(
      exposure.actualExposedTokens,
      countStaticRepositoryPayloadTokens(context),
      "generation context must be exactly the frozen EL static payload"
    );
    assert.strictEqual(meta.actual_context_tokens, exposure.actualExposedTokens);
    assert.strictEqual(meta.condition, "EL");
    assert.strictEqual(meta.condition_metadata.repository_access, "static-subset");
    assert.strictEqual(meta.condition_metadata.budget_kind, "static-exposure");

    console.log(JSON.stringify({
      status: "ok",
      logDir,
      nominalBudget: exposure.budgetTokens,
      actualExposedTokens: exposure.actualExposedTokens,
      selectedUnits: exposure.selectedUnitCount,
      orderedUnits: exposure.orderedUnitCount,
    }, null, 2));
  } finally {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }
}

function loadRepositoryFiles(repositoryDir: string): Record<string, string> {
  const result: Record<string, string> = {};
  walk(repositoryDir, repositoryDir, result);
  return result;
}

function walk(
  baseDir: string,
  currentDir: string,
  result: Record<string, string>
): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolute = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walk(baseDir, absolute, result);
    } else if (entry.isFile()) {
      const relative = path.relative(baseDir, absolute).replace(/\\/g, "/");
      result[relative] = fs.readFileSync(absolute, "utf8");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
