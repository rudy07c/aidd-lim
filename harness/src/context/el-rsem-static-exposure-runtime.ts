import * as fs from "fs";
import * as path from "path";
import type {
  EntityId,
  GroundTruth,
  GroundTruthDelta,
  Invariant,
  NamingScheme,
} from "../../../synthetic-world/schema";
import { chunkArtifactFile } from "../measurement/artifact-unit";
import type { RunConfig } from "../types";
import {
  buildPrivilegedRetrievalPlan,
  PRIVILEGED_RETRIEVAL_POLICY_VERSION,
} from "./privileged-retrieval-controller";
import {
  EL_ARTIFACT_CHUNKER_VERSION,
} from "./el-static-exposure-runtime";
import {
  buildStaticExposurePrefix,
  StaticExposureOrderedUnit,
  StaticExposurePrefixResult,
} from "./static-exposure";

export const EL_RSEM_BANK_SELECTOR_VERSION =
  "p6-3-el-rsem-bank-prompt-union-pr-ranking-v1" as const;

/**
 * Rsem gets exactly one static exposure plan for the full 12-probe bank.
 * The selector accepts prompt strings only by design: correctAnswer,
 * candidateSource, reachable counterexamples and observed outcomes have no API
 * path into ranking.
 */
export function assembleELRSemBankStaticExposure(args: {
  config: RunConfig;
  probePrompts: readonly string[];
  namingSchemeId: string;
  repositoryFiles: Readonly<Record<string, string>>;
}): StaticExposurePrefixResult {
  const { config, probePrompts, namingSchemeId, repositoryFiles } = args;
  if (config.condition !== "EL") {
    throw new Error(`EL Rsem static exposure runtime received condition ${config.condition}`);
  }
  if (
    typeof config.contextBudget !== "number" ||
    !Number.isInteger(config.contextBudget) ||
    config.contextBudget < 0
  ) {
    throw new Error("EL Rsem requires a non-negative integer contextBudget representing B_expose");
  }
  const maxTokensPerUnit = config.staticExposureMaxTokensPerUnit;
  if (
    typeof maxTokensPerUnit !== "number" ||
    !Number.isInteger(maxTokensPerUnit) ||
    maxTokensPerUnit <= 0
  ) {
    throw new Error("EL Rsem requires a positive integer staticExposureMaxTokensPerUnit");
  }
  if (probePrompts.length === 0 || probePrompts.some((prompt) => typeof prompt !== "string" || prompt.length === 0)) {
    throw new Error("EL Rsem selector requires a non-empty bank of non-empty probe prompt strings");
  }

  const { groundTruth, namingScheme } = loadPrivilegedInputs(
    config.syntheticWorldDir,
    namingSchemeId
  );
  const seedEntities = derivePromptUnionEntityIds(
    probePrompts,
    groundTruth,
    namingScheme
  );
  if (seedEntities.length === 0) {
    throw new Error("EL Rsem prompt-union selector found no entity display names in the probe bank");
  }

  const seedDelta = promptUnionSeedDelta(groundTruth, seedEntities);
  const ranking = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: seedDelta,
    namingScheme,
    repositoryFiles,
  });

  const orderedUnits: StaticExposureOrderedUnit[] = [];
  for (const entry of ranking.entries) {
    const content = repositoryFiles[entry.path];
    if (content === undefined) {
      throw new Error(`EL Rsem ranking references repository path not present in snapshot: ${entry.path}`);
    }
    const chunks = chunkArtifactFile(entry.path, content, maxTokensPerUnit);
    for (const unit of chunks) {
      orderedUnits.push({
        unit,
        selectorSequence: entry.sequence,
        category: entry.category,
        mappedEntities: [...entry.mappedEntities],
        semanticRelevant: entry.semanticRelevant,
        dependencyDistance: entry.dependencyDistance,
      });
    }
  }

  return buildStaticExposurePrefix({
    orderedUnits,
    fullRepositoryFiles: repositoryFiles,
    budgetTokens: config.contextBudget,
    maxTokensPerUnit,
    artifactChunkerVersion: EL_ARTIFACT_CHUNKER_VERSION,
    selectorKind: "rsem-bank-prompt-union-ranking",
    selectorId: `${EL_RSEM_BANK_SELECTOR_VERSION}:${namingSchemeId}`,
    rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
  });
}

/** Prompt-only relevance seed. No probe answer/provenance fields are accepted. */
export function derivePromptUnionEntityIds(
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

/**
 * Reuse the frozen PR ranking implementation without changing it. Self-invariant
 * seeds make the prompt-mentioned entities the Surface locality roots while
 * adding no relation between different entities. Existing GroundTruth then
 * supplies the same semantic/dependency closure used by PR.
 */
function promptUnionSeedDelta(
  groundTruth: GroundTruth,
  entityIds: readonly EntityId[]
): GroundTruthDelta {
  const addInvariants: Invariant[] = entityIds.map((entityId) => {
    const entity = groundTruth.entities.find((candidate) => candidate.id === entityId);
    if (!entity) throw new Error(`Unknown Rsem selector seed entity: ${entityId}`);
    const state = entity.initialState;
    return {
      id: `__p6_3_rsem_selector_seed__${entityId}`,
      description: "P6-3 selector-only self seed; never model-visible",
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
    throw new Error(`Naming scheme not found for EL Rsem bank: ${namingSchemeId}`);
  }
  return { groundTruth, namingScheme };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
