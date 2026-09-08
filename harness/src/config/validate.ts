import { BackendType, ContextCondition, RunConfig } from "../types";

const BACKENDS: BackendType[] = ["mock-noop", "mock-oracle", "anthropic"];
const CONDITIONS: ContextCondition[] = ["full", "simple-limited"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalString(obj: Record<string, unknown>, key: string): void {
  const value = obj[key];
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Config field "${key}" must be a string`);
  }
}

/** JSON parse直後のshape検査。default適用前に明らかな型不正を弾く。 */
export function validateRawRunConfig(value: unknown): asserts value is Partial<RunConfig> {
  if (!isRecord(value)) {
    throw new Error("Config root must be a JSON object");
  }

  assertOptionalString(value, "experimentId");
  assertOptionalString(value, "lineageId");
  assertOptionalString(value, "backend");
  assertOptionalString(value, "condition");
  assertOptionalString(value, "model");
  assertOptionalString(value, "stage");
  assertOptionalString(value, "syntheticWorldDir");
  assertOptionalString(value, "runsDir");

  if (
    value.contextBudget !== undefined &&
    value.contextBudget !== "full" &&
    (typeof value.contextBudget !== "number" || !Number.isFinite(value.contextBudget))
  ) {
    throw new Error('Config field "contextBudget" must be a finite number or "full"');
  }

  if (
    value.generations !== undefined &&
    (typeof value.generations !== "number" || !Number.isInteger(value.generations))
  ) {
    throw new Error('Config field "generations" must be an integer');
  }

  if (value.tasks !== undefined) {
    if (!Array.isArray(value.tasks) || value.tasks.some((t) => typeof t !== "string")) {
      throw new Error('Config field "tasks" must be an array of strings');
    }
  }
}

/** default適用・path解決後のsemantic validation。 */
export function validateResolvedRunConfig(config: RunConfig): void {
  if (!BACKENDS.includes(config.backend)) {
    throw new Error(`Unsupported backend: ${config.backend}`);
  }
  if (!CONDITIONS.includes(config.condition)) {
    throw new Error(`Unsupported context condition: ${config.condition}`);
  }
  if (
    config.contextBudget !== "full" &&
    (!Number.isFinite(config.contextBudget) || config.contextBudget < 0)
  ) {
    throw new Error("contextBudget must be non-negative or \"full\"");
  }
  if (!Number.isInteger(config.generations) || config.generations <= 0) {
    throw new Error("generations must be a positive integer");
  }
  if (config.tasks.length === 0) {
    throw new Error("tasks must contain at least one task id");
  }
  if (config.tasks.some((taskId) => taskId.length === 0)) {
    throw new Error("task ids must be non-empty strings");
  }

  // Stage 0はhistorical behaviorとしてtask cyclingを許す。
  // Stage 1以降のscientific longitudinal runでは同じGroundTruthDeltaの再適用を禁止する。
  const scientificLongitudinal =
    config.stage?.startsWith("stage1") || config.stage?.startsWith("stage2");

  if (scientificLongitudinal) {
    const unique = new Set(config.tasks);
    if (unique.size !== config.tasks.length) {
      throw new Error(
        "Stage 1/2 scientific runs must not contain duplicate task ids; GroundTruthDelta reuse is forbidden"
      );
    }
    if (config.generations > config.tasks.length) {
      throw new Error(
        `Stage 1/2 scientific runs require one unique task per generation: generations=${config.generations}, tasks=${config.tasks.length}`
      );
    }
  }
}
