import {
  BackendType,
  ContextCondition,
  OpenAIServiceTier,
  PromptCacheMode,
  RunClass,
  RunConfig,
} from "../types";

const BACKENDS: BackendType[] = ["mock-noop", "mock-oracle", "anthropic", "openai"];
const CONDITIONS: ContextCondition[] = ["full", "simple-limited"];
const SERVICE_TIERS: OpenAIServiceTier[] = ["auto", "default", "flex", "fast", "priority", "ultrafast"];
const CACHE_MODES: PromptCacheMode[] = ["implicit", "explicit"];
const RUN_CLASSES: RunClass[] = ["historical", "smoke", "scientific-calibration", "scientific-main"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalString(obj: Record<string, unknown>, key: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== "string") throw new Error(`Config field "${key}" must be a string`);
}

function requireOwn(obj: Record<string, unknown>, key: string): void {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`Stage 1/2 OpenAI run must explicitly specify raw config field "${key}"`);
  }
}

/** JSON parse直後のshape検査。Stage 1/2のfreeze必須fieldはdefault適用前に存在確認する。 */
export function validateRawRunConfig(value: unknown): asserts value is Partial<RunConfig> & { runClass: RunClass } {
  if (!isRecord(value)) throw new Error("Config root must be a JSON object");

  for (const key of [
    "experimentId", "lineageId", "runClass", "backend", "condition", "model", "reasoningEffort", "stage",
    "syntheticWorldDir", "runsDir", "serviceTier", "promptCacheMode",
  ]) assertOptionalString(value, key);

  for (const key of ["maxOutputTokens", "requestTimeoutMs", "maxRetries", "maxToolRounds"] as const) {
    const v = value[key];
    if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v))) {
      throw new Error(`Config field "${key}" must be an integer`);
    }
  }
  if (value.storeResponses !== undefined && typeof value.storeResponses !== "boolean") {
    throw new Error('Config field "storeResponses" must be a boolean');
  }
  if (value.contextBudget !== undefined && value.contextBudget !== "full" &&
      (typeof value.contextBudget !== "number" || !Number.isFinite(value.contextBudget))) {
    throw new Error('Config field "contextBudget" must be a finite number or "full"');
  }
  if (value.generations !== undefined && (typeof value.generations !== "number" || !Number.isInteger(value.generations))) {
    throw new Error('Config field "generations" must be an integer');
  }
  if (value.tasks !== undefined && (!Array.isArray(value.tasks) || value.tasks.some((t) => typeof t !== "string"))) {
    throw new Error('Config field "tasks" must be an array of strings');
  }

  requireOwn(value, "runClass");
  if (!RUN_CLASSES.includes(value.runClass as RunClass)) {
    throw new Error(`Unsupported runClass: ${String(value.runClass)}`);
  }

  const scientificOpenAI =
    (value.runClass === "scientific-calibration" || value.runClass === "scientific-main") &&
    value.backend === "openai";
  if (scientificOpenAI) {
    for (const key of [
      "model", "reasoningEffort", "maxOutputTokens", "requestTimeoutMs", "maxRetries",
      "storeResponses", "maxToolRounds", "serviceTier", "promptCacheMode",
    ]) requireOwn(value, key);
    if (value.storeResponses !== false) throw new Error("Stage 1/2 OpenAI raw config must set storeResponses=false");
    if (value.serviceTier !== "default") {
      throw new Error('Stage 1/2 primary Sync OpenAI run must explicitly set serviceTier="default"');
    }
  }
}

/** default適用・path解決後のsemantic validation。 */
export function validateResolvedRunConfig(config: RunConfig): void {
  if (!RUN_CLASSES.includes(config.runClass)) throw new Error(`Unsupported runClass: ${config.runClass}`);
  if (!BACKENDS.includes(config.backend)) throw new Error(`Unsupported backend: ${config.backend}`);
  if (!CONDITIONS.includes(config.condition)) throw new Error(`Unsupported context condition: ${config.condition}`);
  if (config.contextBudget !== "full" && (!Number.isFinite(config.contextBudget) || config.contextBudget < 0)) {
    throw new Error('contextBudget must be non-negative or "full"');
  }
  if (!Number.isInteger(config.generations) || config.generations <= 0) throw new Error("generations must be a positive integer");
  if (config.tasks.length === 0) throw new Error("tasks must contain at least one task id");
  if (config.tasks.some((taskId) => taskId.length === 0)) throw new Error("task ids must be non-empty strings");

  const reasoningEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
  if (config.reasoningEffort !== undefined && !reasoningEfforts.has(config.reasoningEffort)) {
    throw new Error(`Unsupported reasoningEffort: ${config.reasoningEffort}`);
  }
  if (config.serviceTier !== undefined && !SERVICE_TIERS.includes(config.serviceTier)) {
    throw new Error(`Unsupported serviceTier: ${config.serviceTier}`);
  }
  if (config.promptCacheMode !== undefined && !CACHE_MODES.includes(config.promptCacheMode)) {
    throw new Error(`Unsupported promptCacheMode: ${config.promptCacheMode}`);
  }
  for (const [key, value, min] of [
    ["maxOutputTokens", config.maxOutputTokens, 1],
    ["requestTimeoutMs", config.requestTimeoutMs, 1],
    ["maxRetries", config.maxRetries, 0],
    ["maxToolRounds", config.maxToolRounds, 0],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < min)) throw new Error(`${key} must be an integer >= ${min}`);
  }

  const requiresScientificFreeze =
    config.runClass === "scientific-calibration" || config.runClass === "scientific-main";
  if (requiresScientificFreeze && config.backend === "openai") {
    if (!config.model) throw new Error("Stage 1/2 OpenAI run must explicitly freeze model");
    if (!config.reasoningEffort) throw new Error("Stage 1/2 OpenAI run must explicitly freeze reasoningEffort");
    if (config.maxOutputTokens === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxOutputTokens");
    if (config.requestTimeoutMs === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze requestTimeoutMs");
    if (config.maxRetries === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxRetries");
    if (config.maxToolRounds === undefined) throw new Error("Stage 1/2 OpenAI run must explicitly freeze maxToolRounds");
    if (config.storeResponses !== false) throw new Error("Stage 1/2 OpenAI run must set storeResponses=false");
    if (config.serviceTier !== "default") throw new Error('Stage 1/2 primary Sync run must set serviceTier="default"');
    if (!config.promptCacheMode) throw new Error("Stage 1/2 OpenAI run must explicitly freeze promptCacheMode");
  }

  const requiresUniqueTaskSequence = config.runClass === "scientific-main";
  if (requiresUniqueTaskSequence) {
    const unique = new Set(config.tasks);
    if (unique.size !== config.tasks.length) {
      throw new Error("Stage 1/2 scientific main runs must not contain duplicate task ids; GroundTruthDelta reuse is forbidden");
    }
    if (config.generations > config.tasks.length) {
      throw new Error(`Stage 1/2 scientific main runs require one unique task per generation: generations=${config.generations}, tasks=${config.tasks.length}`);
    }
  }
}
