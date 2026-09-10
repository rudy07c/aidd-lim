import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { validateResolvedRunConfig } from "./src/config/validate";
import { validateObservableInteractionRecord } from "./src/context/observable-interaction";
import { runGenerationLoop } from "./src/orchestrator";
import { RunConfig, Stage1ContextConditionName } from "./src/types";

const CONDITIONS: readonly Stage1ContextConditionName[] = ["MOI", "AF"];
const MODEL = "gpt-5.6-luna";

interface LiveConditionSummary {
  condition: "MOI" | "AF";
  completedGenerations: number;
  generation0RecordHash: string;
  generation1InheritedHash: string | null;
  actualModels: Array<string | null>;
  promptVersions: Array<string | null>;
  tokenUsage: unknown[];
  costsUsd: Array<number | null>;
  logDirs: string[];
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function runCondition(condition: "MOI" | "AF", runsDir: string): Promise<LiveConditionSummary> {
  const config: RunConfig = {
    experimentId: `p2-live-${condition.toLowerCase()}-${Date.now()}`,
    lineageId: "lineage-0",
    runClass: "smoke",
    backend: "openai",
    condition,
    contextBudget: "full",
    generations: 2,
    tasks: ["T-local-1", "T-crosscut-1"],
    model: MODEL,
    reasoningEffort: "low",
    maxOutputTokens: 8192,
    requestTimeoutMs: 120_000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 0,
    serviceTier: "default",
    promptCacheMode: "implicit",
    syntheticWorldDir: path.resolve(__dirname, "../synthetic-world"),
    runsDir,
  };
  validateResolvedRunConfig(config);

  const result = await runGenerationLoop(config);
  if (result.crashed) {
    throw new Error(
      `${condition} live smoke crashed after ${result.completedGenerations} generations: ${result.crashError ?? "unknown"}`
    );
  }
  if (result.completedGenerations !== 2 || result.logDirs.length !== 2) {
    throw new Error(`${condition} live smoke expected 2 completed generations`);
  }

  const records = result.logDirs.map((dir) => readJson(path.join(dir, "observable_interaction_record.json")));
  const metas = result.logDirs.map((dir) => readJson(path.join(dir, "meta.json")));
  records.forEach(validateObservableInteractionRecord);

  for (let generation = 0; generation < 2; generation++) {
    const meta = metas[generation];
    if (meta.model_provenance.actualModel !== MODEL) {
      throw new Error(
        `${condition} generation ${generation}: expected actual model ${MODEL}, got ${String(meta.model_provenance.actualModel)}`
      );
    }
    if (meta.model_provenance.endpoint !== "responses") {
      throw new Error(`${condition} generation ${generation}: expected Responses endpoint`);
    }
    if (meta.model_provenance.storeResponses !== false) {
      throw new Error(`${condition} generation ${generation}: storeResponses must remain false`);
    }
    if (meta.model_provenance.continuationState !== "none") {
      throw new Error(`${condition} generation ${generation}: one-shot P2 smoke must not inherit provider continuation state`);
    }
    if (meta.context_budget !== "full") {
      throw new Error(`${condition} generation ${generation}: context budget must be full`);
    }
    if (
      meta.operational_full_feasibility?.checked !== true ||
      meta.operational_full_feasibility?.feasible !== true
    ) {
      throw new Error(`${condition} generation ${generation}: Operational-Full feasibility was not satisfied`);
    }
    if (!meta.token_usage || typeof meta.token_usage.input !== "number" || meta.token_usage.input <= 0) {
      throw new Error(`${condition} generation ${generation}: provider token usage missing`);
    }
    if (records[generation].observableAssistantMessages.length === 0) {
      throw new Error(`${condition} generation ${generation}: observable assistant response was not retained`);
    }
    if (records[generation].observableAssistantMessages.some((item: any) => item.source !== "artifact-redundant")) {
      throw new Error(`${condition} generation ${generation}: assistant response source tag drifted`);
    }
  }

  if (metas[0].observable_interaction.inherited_previous_hash !== null) {
    throw new Error(`${condition} generation 0 must not inherit a predecessor record`);
  }
  if (condition === "MOI") {
    if (metas[1].observable_interaction.inherited_previous_hash !== records[0].contentHash) {
      throw new Error("MOI generation 1 did not inherit exactly generation 0 observable record");
    }
  } else if (metas[1].observable_interaction.inherited_previous_hash !== null) {
    throw new Error("AF generation 1 must not inherit observable history");
  }

  return {
    condition,
    completedGenerations: result.completedGenerations,
    generation0RecordHash: records[0].contentHash,
    generation1InheritedHash: metas[1].observable_interaction.inherited_previous_hash,
    actualModels: metas.map((meta) => meta.model_provenance.actualModel),
    promptVersions: metas.map((meta) => meta.model_provenance.promptVersion),
    tokenUsage: metas.map((meta) => meta.token_usage),
    costsUsd: metas.map((meta) => meta.cost),
    logDirs: result.logDirs,
  };
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  const runsDir = path.resolve(__dirname, "../runs/_smoke/p2-openai-live");
  fs.mkdirSync(runsDir, { recursive: true });

  const summaries: LiveConditionSummary[] = [];
  for (const condition of CONDITIONS) {
    summaries.push(await runCondition(condition, runsDir));
  }

  console.log(JSON.stringify({
    status: "ok",
    model: MODEL,
    generationsPerCondition: 2,
    conditions: summaries,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
