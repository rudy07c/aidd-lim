import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  buildP63CalibrationPlan,
  P6_3_EXPECTED_NORMAL_CALL_COUNT,
  type P63FrozenBudgets,
} from "./p6-3-live-calibration-runner";
import {
  P6_3_V2_EXECUTION_PARAMETERS_VERSION,
  P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  P6_3_V2_MUTATION_PROVIDER_CONTRACT,
  P6_3_V2_RSEM_PROVIDER_CONTRACT,
} from "./p6-3-v2-execution-parameters";

export const P6_3_V2_CLI_PREFLIGHT_VERSION =
  "p6-3-v2-cli-preflight-v3" as const;

export const P6_3_V2_FROZEN_BUDGETS: P63FrozenBudgets = Object.freeze({
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
});

export interface P63V2CliPreflightReport {
  readonly version: typeof P6_3_V2_CLI_PREFLIGHT_VERSION;
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly totalLogicalCells: number;
  readonly T_EL: number;
  readonly staticExposureMaxTokensPerUnit: number;
  readonly budgets: P63FrozenBudgets;
  readonly mutationProvider: {
    readonly model: string;
    readonly reasoningEffort: string;
    readonly maxOutputTokens: number;
  };
  readonly rsemProvider: {
    readonly model: string;
    readonly reasoningEffort: string;
    readonly maxOutputTokens: number;
  };
  readonly maxScientificAttemptsPerLogicalCell: number;
  readonly executionParametersVersion: string;
  readonly structuralFreezeSha256: string;
  readonly executionParametersManifestSha256: string;
  readonly v1AutoInfraFixtureSha256: string;
  readonly finalPreLiveSpecSha256: string;
  readonly paidLiveWiringSpecSha256: string;
  readonly executionManifestLiveExecutionAuthorized: false;
  readonly finalPreLiveGateFrozen: true;
  readonly paidLiveAuthorizationRequired: true;
  readonly liveExecutionWired: true;
  readonly liveExecutionAllowed: false;
}

export interface P63V2CliInvocationAuthorization {
  readonly live: boolean;
  readonly paidAuthorization: boolean;
  readonly environment?: NodeJS.ProcessEnv;
}

export function buildP63V2CliPreflight(): P63V2CliPreflightReport {
  const structuralPath = frozenPath("p6-3-el-structural-freeze.json");
  const executionPath = frozenPath("p6-3-v2-execution-parameters.json");
  const regressionPath = frozenPath("p6-3-v1-auto-infra-regression.json");
  const finalSpecPath = frozenPath("p6-3-v2-final-prelive-spec.json");
  const paidLiveSpecPath = frozenPath("p6-3-v2-paid-live-wiring-spec.json");

  const structuralRaw = fs.readFileSync(structuralPath, "utf8");
  const executionRaw = fs.readFileSync(executionPath, "utf8");
  const regressionRaw = fs.readFileSync(regressionPath, "utf8");
  const finalSpecRaw = fs.readFileSync(finalSpecPath, "utf8");
  const paidLiveSpecRaw = fs.readFileSync(paidLiveSpecPath, "utf8");
  const structural = JSON.parse(structuralRaw) as any;
  const execution = JSON.parse(executionRaw) as any;
  const finalSpec = JSON.parse(finalSpecRaw) as any;
  const paidLiveSpec = JSON.parse(paidLiveSpecRaw) as any;

  assertEqual(structural.freezeCandidate?.T_EL, 4046, "structural T_EL");
  assertEqual(
    structural.freezeCandidate?.staticExposureMaxTokensPerUnit,
    256,
    "structural maxTokensPerUnit"
  );
  assertStableEqual(
    structural.freezeCandidate?.budgets,
    P6_3_V2_FROZEN_BUDGETS,
    "structural budget grid"
  );
  assertEqual(execution.structuralVariables?.immutable, true, "v2 structural immutability");
  assertStableEqual(
    execution.structuralVariables?.budgets,
    P6_3_V2_FROZEN_BUDGETS,
    "v2 execution-manifest budget grid"
  );
  assertEqual(
    execution.mutationProvider?.maxOutputTokens,
    P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
    "v2 mutation maxOutputTokens"
  );
  assertEqual(
    execution.rsemProvider?.maxOutputTokens,
    P6_3_V2_RSEM_PROVIDER_CONTRACT.maxOutputTokens,
    "v2 Rsem maxOutputTokens"
  );
  assertEqual(
    execution.executionPolicy?.maxScientificAttemptsPerLogicalCell,
    P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
    "v2 scientific attempt ceiling"
  );
  assertEqual(
    execution.liveExecutionAuthorized,
    false,
    "execution-parameter manifest must not authorize live execution"
  );

  assertEqual(
    finalSpec.schemaVersion,
    "p6-3-v2-final-prelive-spec-v1",
    "base final pre-live spec schema"
  );
  assertEqual(finalSpec.status, "final-prelive-spec-frozen", "base final pre-live spec status");
  assertEqual(finalSpec.totalLogicalCells, 864, "base final pre-live spec plan size");
  assertEqual(finalSpec.mutationMaxOutputTokens, 14000, "base final pre-live mutation cap");
  assertEqual(finalSpec.rsemMaxOutputTokens, 8000, "base final pre-live Rsem cap");
  assertEqual(finalSpec.liveExecutionAuthorized, false, "base final pre-live live authorization");
  assertEqual(
    finalSpec.paidLiveAuthorizationRequired,
    true,
    "base final pre-live paid authorization boundary"
  );

  assertEqual(
    paidLiveSpec.schemaVersion,
    "p6-3-v2-paid-live-wiring-spec-v1",
    "paid/live wiring spec schema"
  );
  assertEqual(paidLiveSpec.status, "paid-live-wiring-frozen", "paid/live wiring spec status");
  assertEqual(paidLiveSpec.totalLogicalCells, 864, "paid/live wiring plan size");
  assertEqual(paidLiveSpec.liveExecutionWired, true, "paid/live wiring state");
  assertEqual(paidLiveSpec.liveExecutionAuthorized, false, "paid/live wiring authorization state");
  assertEqual(
    paidLiveSpec.paidLiveAuthorizationRequired,
    true,
    "paid/live wiring authorization boundary"
  );

  const plan = buildP63CalibrationPlan(P6_3_V2_FROZEN_BUDGETS);
  assertEqual(plan.length, P6_3_EXPECTED_NORMAL_CALL_COUNT, "v2 calibration plan size");

  return Object.freeze({
    version: P6_3_V2_CLI_PREFLIGHT_VERSION,
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    totalLogicalCells: plan.length,
    T_EL: 4046,
    staticExposureMaxTokensPerUnit: 256,
    budgets: P6_3_V2_FROZEN_BUDGETS,
    mutationProvider: Object.freeze({
      model: P6_3_V2_MUTATION_PROVIDER_CONTRACT.model,
      reasoningEffort: P6_3_V2_MUTATION_PROVIDER_CONTRACT.reasoningEffort,
      maxOutputTokens: P6_3_V2_MUTATION_PROVIDER_CONTRACT.maxOutputTokens,
    }),
    rsemProvider: Object.freeze({
      model: P6_3_V2_RSEM_PROVIDER_CONTRACT.model,
      reasoningEffort: P6_3_V2_RSEM_PROVIDER_CONTRACT.reasoningEffort,
      maxOutputTokens: P6_3_V2_RSEM_PROVIDER_CONTRACT.maxOutputTokens,
    }),
    maxScientificAttemptsPerLogicalCell:
      P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
    executionParametersVersion: P6_3_V2_EXECUTION_PARAMETERS_VERSION,
    structuralFreezeSha256: sha256(structuralRaw),
    executionParametersManifestSha256: sha256(executionRaw),
    v1AutoInfraFixtureSha256: sha256(regressionRaw),
    finalPreLiveSpecSha256: sha256(finalSpecRaw),
    paidLiveWiringSpecSha256: sha256(paidLiveSpecRaw),
    executionManifestLiveExecutionAuthorized: false,
    finalPreLiveGateFrozen: true,
    paidLiveAuthorizationRequired: true,
    liveExecutionWired: true,
    liveExecutionAllowed: false,
  });
}

/**
 * Provider-free runtime authorization guard. A live invocation requires two
 * independent operator signals; neither committed spec nor gate receipt can
 * self-authorize paid/provider execution.
 */
export function assertP63V2CliInvocationAllowed(
  args: P63V2CliInvocationAuthorization
): void {
  if (!args.live) return;
  if (!args.paidAuthorization) {
    throw new Error(
      "P6-3 v2 live execution blocked: explicit --authorize-paid-live=P6-3-v2 is required; no provider calls were made."
    );
  }
  const environment = args.environment ?? process.env;
  if (environment.P6_3_LIVE_EXECUTION_ALLOWED !== "1") {
    throw new Error(
      "P6-3 v2 live execution blocked: P6_3_LIVE_EXECUTION_ALLOWED=1 is required in addition to the paid-live flag; no provider calls were made."
    );
  }
}

function frozenPath(name: string): string {
  return path.resolve(__dirname, "../../frozen", name);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function assertStableEqual(actual: unknown, expected: unknown, label: string): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}
