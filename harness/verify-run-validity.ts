import { shouldCensorGeneration } from "./src/orchestrator";
import { validateRawRunConfig } from "./src/config/validate";

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

console.log("Run validity verification passed.");
