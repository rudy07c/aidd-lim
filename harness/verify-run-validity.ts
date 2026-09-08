import { shouldCensorGeneration } from "./src/orchestrator";
import { validateRawRunConfig, validateResolvedRunConfig } from "./src/config/validate";
import { RunConfig } from "./src/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const status of [
  "provider-error",
  "response-failed",
  "response-incomplete",
  "response-not-completed",
  "response-refusal",
] as const) {
  assert(shouldCensorGeneration(status), `${status} must be censored`);
}
for (const status of ["ok", "output-parse-failure", "tool-error", "mutation-validation-failure"] as const) {
  assert(!shouldCensorGeneration(status), `${status} must not be censored`);
}

const scientificBase = {
  runClass: "scientific-calibration",
  stage: "arbitrary-name-not-stage1",
  backend: "openai",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  maxOutputTokens: 8192,
  requestTimeoutMs: 120000,
  maxRetries: 2,
  storeResponses: false,
  maxToolRounds: 4,
  serviceTier: "default",
  promptCacheMode: "implicit",
};
validateRawRunConfig(scientificBase);

let missingFreezeRejected = false;
try {
  const { maxRetries: _ignored, ...missing } = scientificBase;
  validateRawRunConfig(missing);
} catch {
  missingFreezeRejected = true;
}
assert(missingFreezeRejected, "scientific-calibration must enforce freeze independent of stage name");

let missingRunClassRejected = false;
try {
  validateRawRunConfig({ backend: "mock-noop", stage: "stage0" });
} catch {
  missingRunClassRejected = true;
}
assert(missingRunClassRejected, "runClass must be explicit in raw config");

validateRawRunConfig({ runClass: "historical", backend: "mock-noop", stage: "stage1-looking-name" });

function makeResolvedConfig(runClass: RunConfig["runClass"], tasks: string[], generations: number): RunConfig {
  return {
    experimentId: "verify-run-class",
    lineageId: "lineage-0",
    runClass,
    backend: "openai",
    condition: "full",
    contextBudget: "full",
    generations,
    tasks,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    maxOutputTokens: 8192,
    requestTimeoutMs: 120000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 4,
    serviceTier: "default",
    promptCacheMode: "implicit",
    syntheticWorldDir: "/tmp/synthetic-world",
    runsDir: "/tmp/runs",
  };
}

// Calibration may intentionally repeat the same task to estimate variance / floor behavior.
validateResolvedRunConfig(makeResolvedConfig("scientific-calibration", ["T-local-1", "T-local-1"], 2));

let mainDuplicateRejected = false;
try {
  validateResolvedRunConfig(makeResolvedConfig("scientific-main", ["T-local-1", "T-local-1"], 2));
} catch {
  mainDuplicateRejected = true;
}
assert(mainDuplicateRejected, "scientific-main must reject duplicate task ids");

let mainCyclingRejected = false;
try {
  validateResolvedRunConfig(makeResolvedConfig("scientific-main", ["T-local-1", "T-crosscut-1"], 3));
} catch {
  mainCyclingRejected = true;
}
assert(mainCyclingRejected, "scientific-main must reject generations greater than unique task sequence length");

let calibrationMissingFreezeRejected = false;
try {
  const config = makeResolvedConfig("scientific-calibration", ["T-local-1", "T-local-1"], 2);
  config.reasoningEffort = undefined;
  validateResolvedRunConfig(config);
} catch {
  calibrationMissingFreezeRejected = true;
}
assert(calibrationMissingFreezeRejected, "scientific-calibration must still enforce model/API freeze");

console.log("Run validity verification passed.");
