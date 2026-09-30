import * as fs from "fs";
import * as path from "path";
import type {
  EntityId,
  GroundTruth,
  GroundTruthDelta,
  Invariant,
  NamingScheme,
} from "../../../synthetic-world/schema";
import {
  buildP63V3FinalStaticExposureOrder,
  P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
} from "./p6-3-v3-final-static-exposure-selector";
import {
  buildPrivilegedRetrievalPlan,
  PRIVILEGED_RETRIEVAL_POLICY_VERSION,
} from "./privileged-retrieval-controller";
import {
  buildStaticExposurePrefix,
  type StaticExposurePrefixResult,
} from "./static-exposure";

export const P6_3_V3_STATIC_EXPOSURE_RUNTIME_VERSION =
  "p6-3-v3-static-exposure-runtime-v1" as const;
export const P6_3_V3_TASK_SELECTOR_ID_VERSION =
  "p6-3-v3-final-task-selector-v1" as const;
export const P6_3_V3_RSEM_BANK_SELECTOR_ID_VERSION =
  "p6-3-v3-final-rsem-prompt-union-selector-v1" as const;
export const P6_3_V3_ARTIFACT_CHUNKER_VERSION =
  "artifact-unit-chunkArtifactFile-v1" as const;

export interface P63V3ExposureTaskDescriptor {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

/**
 * Build one v3 M artifact exposure.
 *
 * The evaluator-side privileged ranking is unchanged, but cross-category order
 * is owned exclusively by the structurally frozen final v3 selector. E_fixed is
 * intentionally absent from this API and therefore cannot consume B_expose.
 */
export function assembleP63V3TaskStaticExposure(args: {
  syntheticWorldDir: string;
  task: P63V3ExposureTaskDescriptor;
  repositoryFiles: Readonly<Record<string, string>>;
  budgetTokens: number;
  maxTokensPerUnit: number;
}): StaticExposurePrefixResult {
  assertBudgetInputs(args.budgetTokens, args.maxTokensPerUnit);
  if (!args.task.groundTruthDelta) {
    throw new Error(`P6-3 v3 task ${args.task.taskId} is missing GroundTruthDelta`);
  }
  if (!args.task.namingScheme) {
    throw new Error(`P6-3 v3 task ${args.task.taskId} is missing namingScheme`);
  }

  const { groundTruth, namingScheme } = loadPrivilegedInputs(
    args.syntheticWorldDir,
    args.task.namingScheme
  );
  const ranking = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: args.task.groundTruthDelta,
    namingScheme,
    repositoryFiles: args.repositoryFiles,
  });
  const finalPlan = buildP63V3FinalStaticExposureOrder({
    ranking,
    repositoryFiles: args.repositoryFiles,
    maxTokensPerUnit: args.maxTokensPerUnit,
  });
  assertFinalPlanVersion(finalPlan.policyVersion);

  return buildStaticExposurePrefix({
    orderedUnits: finalPlan.orderedUnits,
    fullRepositoryFiles: args.repositoryFiles,
    budgetTokens: args.budgetTokens,
    maxTokensPerUnit: args.maxTokensPerUnit,
    artifactChunkerVersion: P6_3_V3_ARTIFACT_CHUNKER_VERSION,
    selectorKind: "p6-3-v3-final-task-selector",
    selectorId: `${P6_3_V3_TASK_SELECTOR_ID_VERSION}:${args.task.taskId}:${finalPlan.policyVersion}`,
    rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    selectorSurfaceEntities: ranking.surfaceEntities,
    selectorSemanticEntities: ranking.semanticEntities,
  });
}

/**
 * Build one v3 Rsem bank artifact exposure from probe prompts only.
 * Correct answers, prior scores, provider responses, and E_fixed are not inputs.
 */
export function assembleP63V3RSemBankStaticExposure(args: {
  syntheticWorldDir: string;
  probePrompts: readonly string[];
  namingSchemeId: string;
  repositoryFiles: Readonly<Record<string, string>>;
  budgetTokens: number;
  maxTokensPerUnit: number;
}): StaticExposurePrefixResult {
  assertBudgetInputs(args.budgetTokens, args.maxTokensPerUnit);
  if (
    args.probePrompts.length === 0 ||
    args.probePrompts.some((prompt) => typeof prompt !== "string" || prompt.length === 0)
  ) {
    throw new Error("P6-3 v3 Rsem selector requires a non-empty bank of non-empty prompt strings");
  }

  const { groundTruth, namingScheme } = loadPrivilegedInputs(
    args.syntheticWorldDir,
    args.namingSchemeId
  );
  const seedEntities = deriveP63V3PromptUnionEntityIds(
    args.probePrompts,
    groundTruth,
    namingScheme
  );
  if (seedEntities.length === 0) {
    throw new Error("P6-3 v3 Rsem prompt-union selector found no entity display names in probe bank");
  }
  const ranking = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: promptUnionSeedDelta(groundTruth, seedEntities),
    namingScheme,
    repositoryFiles: args.repositoryFiles,
  });
  const finalPlan = buildP63V3FinalStaticExposureOrder({
    ranking,
    repositoryFiles: args.repositoryFiles,
    maxTokensPerUnit: args.maxTokensPerUnit,
  });
  assertFinalPlanVersion(finalPlan.policyVersion);

  return buildStaticExposurePrefix({
    orderedUnits: finalPlan.orderedUnits,
    fullRepositoryFiles: args.repositoryFiles,
    budgetTokens: args.budgetTokens,
    maxTokensPerUnit: args.maxTokensPerUnit,
    artifactChunkerVersion: P6_3_V3_ARTIFACT_CHUNKER_VERSION,
    selectorKind: "p6-3-v3-final-rsem-bank-selector",
    selectorId: `${P6_3_V3_RSEM_BANK_SELECTOR_ID_VERSION}:${args.namingSchemeId}:${finalPlan.policyVersion}`,
    rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    selectorSurfaceEntities: ranking.surfaceEntities,
    selectorSemanticEntities: ranking.semanticEntities,
  });
}

/** Prompt-only entity seed, kept outcome-blind by its input surface. */
export function deriveP63V3PromptUnionEntityIds(
  probePrompts: readonly string[],
  groundTruth: GroundTruth,
  namingScheme: NamingScheme
): EntityId[] {
  const result: EntityId[] = [];
  for (const entity of [...groundTruth.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    const displayName = namingScheme.entityNames[entity.id];
    if (!displayName) {
      throw new Error(`Naming scheme ${namingScheme.schemeId} has no entity name for ${entity.id}`);
    }
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_])${escapeRegex(displayName)}([^A-Za-z0-9_]|$)`
    );
    if (probePrompts.some((prompt) => pattern.test(prompt))) result.push(entity.id);
  }
  return result;
}

function promptUnionSeedDelta(
  groundTruth: GroundTruth,
  entityIds: readonly EntityId[]
): GroundTruthDelta {
  const addInvariants: Invariant[] = entityIds.map((entityId) => {
    const entity = groundTruth.entities.find((candidate) => candidate.id === entityId);
    if (!entity) throw new Error(`Unknown P6-3 v3 Rsem selector seed entity: ${entityId}`);
    const state = entity.initialState;
    return {
      id: `__p6_3_v3_rsem_selector_seed__${entityId}`,
      description: "P6-3 v3 selector-only self seed; never model-visible",
      encoding: "explicit",
      condition: { entity: entityId, state },
      requires: { entity: entityId, state },
    };
  });
  return { addInvariants };
}

function loadPrivilegedInputs(
  syntheticWorldDir: string,
  namingSchemeId: string
): { groundTruth: GroundTruth; namingScheme: NamingScheme } {
  const groundTruth = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8")
  ) as GroundTruth;
  const namingSchemes = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8")
  ) as NamingScheme[];
  const namingScheme = namingSchemes.find(
    (candidate) => candidate.schemeId === namingSchemeId
  );
  if (!namingScheme) {
    throw new Error(`Naming scheme not found for P6-3 v3 exposure: ${namingSchemeId}`);
  }
  return { groundTruth, namingScheme };
}

function assertBudgetInputs(budgetTokens: number, maxTokensPerUnit: number): void {
  if (!Number.isInteger(budgetTokens) || budgetTokens < 0) {
    throw new Error("P6-3 v3 B_expose must be a non-negative integer");
  }
  if (!Number.isInteger(maxTokensPerUnit) || maxTokensPerUnit <= 0) {
    throw new Error("P6-3 v3 maxTokensPerUnit must be a positive integer");
  }
}

function assertFinalPlanVersion(version: string): void {
  if (version !== P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION) {
    throw new Error(`P6-3 v3 final selector version drift: ${version}`);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
