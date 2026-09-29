import { createHash } from "crypto";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "../measurement/token-counter";

export const FIXED_ENVIRONMENT_POLICY_NONE = "none" as const;
export const WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION =
  "world-protocol-surface-v1" as const;
export const FIXED_ENVIRONMENT_LOG_SCHEMA_VERSION =
  "p6-3-v3-fixed-environment-binding-v1" as const;

export type FixedEnvironmentPolicyVersion =
  | typeof FIXED_ENVIRONMENT_POLICY_NONE
  | typeof WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION;

/**
 * Run-fixed, model-visible environment specification that is explicitly outside
 * artifact-evidence budgets such as B_expose/B_work.
 *
 * The binding is created once from Generation 0 / run-start material and reused
 * unchanged across all generations and conditions in the same treatment family.
 * `modelVisibleTokens` is diagnostic/provider-input accounting only: it MUST NOT be
 * added to or subtracted from artifact-budget counters.
 */
export interface FixedEnvironmentBinding {
  policyVersion: typeof WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION;
  sourceKind: "generation-zero";
  sourceRepositorySha256: string;
  surfaceSpecVersion: string;
  surfaceSpecSha256: string;
  modelVisibleText: string;
  modelVisibleSha256: string;
  modelVisibleTokens: number;
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
}

export interface FixedEnvironmentLogSnapshot {
  schemaVersion: typeof FIXED_ENVIRONMENT_LOG_SCHEMA_VERSION;
  identity: string;
  policyVersion: FixedEnvironmentBinding["policyVersion"];
  sourceKind: FixedEnvironmentBinding["sourceKind"];
  sourceRepositorySha256: string;
  surfaceSpecVersion: string;
  surfaceSpecSha256: string;
  modelVisibleText: string;
  modelVisibleSha256: string;
  modelVisibleTokens: number;
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
}

export function createFixedEnvironmentBinding(args: {
  sourceRepositorySha256: string;
  surfaceSpecVersion: string;
  surfaceSpecSha256: string;
  modelVisibleText: string;
}): Readonly<FixedEnvironmentBinding> {
  const sourceRepositorySha256 = requireSha256(
    args.sourceRepositorySha256,
    "sourceRepositorySha256"
  );
  const surfaceSpecSha256 = requireSha256(
    args.surfaceSpecSha256,
    "surfaceSpecSha256"
  );
  if (!args.surfaceSpecVersion.trim()) {
    throw new Error("surfaceSpecVersion must be non-empty");
  }
  if (!args.modelVisibleText.trim()) {
    throw new Error("modelVisibleText must be non-empty");
  }

  const modelVisibleSha256 = sha256(args.modelVisibleText);
  return Object.freeze({
    policyVersion: WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION,
    sourceKind: "generation-zero",
    sourceRepositorySha256,
    surfaceSpecVersion: args.surfaceSpecVersion,
    surfaceSpecSha256,
    modelVisibleText: args.modelVisibleText,
    modelVisibleSha256,
    modelVisibleTokens: countCanonicalTokens(args.modelVisibleText),
    tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
  });
}

export function assertFixedEnvironmentBinding(
  binding: Readonly<FixedEnvironmentBinding>
): void {
  if (binding.policyVersion !== WORLD_PROTOCOL_FIXED_ENVIRONMENT_POLICY_VERSION) {
    throw new Error(`Unsupported fixed environment policy: ${binding.policyVersion}`);
  }
  if (binding.sourceKind !== "generation-zero") {
    throw new Error(`Fixed environment source must be generation-zero, got ${binding.sourceKind}`);
  }
  requireSha256(binding.sourceRepositorySha256, "sourceRepositorySha256");
  requireSha256(binding.surfaceSpecSha256, "surfaceSpecSha256");
  requireSha256(binding.modelVisibleSha256, "modelVisibleSha256");
  if (binding.modelVisibleSha256 !== sha256(binding.modelVisibleText)) {
    throw new Error("Fixed environment modelVisibleSha256 does not match modelVisibleText");
  }
  const tokens = countCanonicalTokens(binding.modelVisibleText);
  if (binding.modelVisibleTokens !== tokens) {
    throw new Error(
      `Fixed environment token count drift: ${binding.modelVisibleTokens} != ${tokens}`
    );
  }
  if (binding.tokenCountMethod !== CANONICAL_TOKEN_COUNT_METHOD) {
    throw new Error(
      `Fixed environment token count method drift: ${binding.tokenCountMethod}`
    );
  }
}

/**
 * Canonical model-facing framing. This is intentionally separate from repository
 * serialization so E_fixed can never be mistaken for artifact evidence.
 */
export function serializeFixedEnvironmentForModel(
  binding: Readonly<FixedEnvironmentBinding>
): string {
  assertFixedEnvironmentBinding(binding);
  return [
    "FIXED ENVIRONMENT SPECIFICATION:",
    `[policy=${binding.policyVersion}]`,
    `[surfaceSpecVersion=${binding.surfaceSpecVersion}]`,
    `[surfaceSpecSha256=${binding.surfaceSpecSha256}]`,
    binding.modelVisibleText,
  ].join("\n");
}

export function fixedEnvironmentIdentity(
  binding: Readonly<FixedEnvironmentBinding>
): string {
  assertFixedEnvironmentBinding(binding);
  return [
    binding.policyVersion,
    binding.sourceRepositorySha256,
    binding.surfaceSpecVersion,
    binding.surfaceSpecSha256,
    binding.modelVisibleSha256,
  ].join(":");
}

/** Exact, serializable reconstruction record for one run-fixed E_fixed binding. */
export function fixedEnvironmentLogSnapshot(
  binding: Readonly<FixedEnvironmentBinding>
): Readonly<FixedEnvironmentLogSnapshot> {
  assertFixedEnvironmentBinding(binding);
  return Object.freeze({
    schemaVersion: FIXED_ENVIRONMENT_LOG_SCHEMA_VERSION,
    identity: fixedEnvironmentIdentity(binding),
    policyVersion: binding.policyVersion,
    sourceKind: binding.sourceKind,
    sourceRepositorySha256: binding.sourceRepositorySha256,
    surfaceSpecVersion: binding.surfaceSpecVersion,
    surfaceSpecSha256: binding.surfaceSpecSha256,
    modelVisibleText: binding.modelVisibleText,
    modelVisibleSha256: binding.modelVisibleSha256,
    modelVisibleTokens: binding.modelVisibleTokens,
    tokenCountMethod: binding.tokenCountMethod,
  });
}

function requireSha256(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${label} must be a 64-character SHA-256 hex digest`);
  }
  return value.toLowerCase();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
