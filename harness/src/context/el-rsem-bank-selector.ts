import * as crypto from "crypto";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import { STAGE1_BOOLEAN_DESIGN_VERSION } from "../../../calibration/src/stage1-probes";
import type {
  EntityId,
  GroundTruth,
  NamingScheme,
} from "../../../synthetic-world/schema";
import {
  classifyArtifactFile,
  type ArtifactFileCategory,
  normalizeRepositoryPath,
} from "../measurement/file-classification";
import {
  computeDependencyEntityDistances,
  deriveEntityFilePathMap,
  PRIVILEGED_RETRIEVAL_POLICY_VERSION,
} from "./privileged-retrieval-controller";
import {
  buildStaticExposureFromRankedPaths,
  type ElStaticExposureResult,
  type StaticExposureRankedPath,
} from "./el-static-exposure";

export const EL_RSEM_BANK_SELECTOR_VERSION =
  `el-rsem-bank-union-${PRIVILEGED_RETRIEVAL_POLICY_VERSION}-v1` as const;

const CATEGORY_PRIORITY: Record<ArtifactFileCategory, number> = {
  type_definition: 0,
  fixed_contract: 1,
  test: 2,
  implementation: 3,
};

/**
 * Deliberately tiny selector input. Answer labels, counterexample witnesses,
 * candidateSource, P6-2 accuracy, and any P6-3 response are structurally absent.
 */
export interface ElRsemSelectorProbe {
  probeId: string;
  namingScheme: string;
  designVersion: string;
  conditionEntity: EntityId;
  requiresEntity: EntityId;
}

export interface ElRsemBankPlan {
  selectorVersion: typeof EL_RSEM_BANK_SELECTOR_VERSION;
  rankingPolicyVersion: typeof PRIVILEGED_RETRIEVAL_POLICY_VERSION;
  probeIds: string[];
  namingScheme: string;
  unionEntities: EntityId[];
  rankedPaths: StaticExposureRankedPath[];
  planInputSha256: string;
}

export function sanitizeElRsemSelectorProbes(
  probes: readonly GeneratedProbe[]
): ElRsemSelectorProbe[] {
  return probes.map((probe) => {
    if (probe.type !== "boolean") {
      throw new Error(`EL Rsem selector requires boolean probes only: ${probe.probeId}`);
    }
    const derived = probe.derivedFrom as Record<string, unknown>;
    if (derived.designVersion !== STAGE1_BOOLEAN_DESIGN_VERSION) {
      throw new Error(
        `EL Rsem selector requires ${STAGE1_BOOLEAN_DESIGN_VERSION}: ${probe.probeId}`
      );
    }
    const condition = readEntityRelation(derived.condition, probe.probeId, "condition");
    const requires = readEntityRelation(derived.requires, probe.probeId, "requires");
    return {
      probeId: probe.probeId,
      namingScheme: probe.namingScheme,
      designVersion: String(derived.designVersion),
      conditionEntity: condition,
      requiresEntity: requires,
    };
  });
}

export function buildElRsemBankPlan(args: {
  repositoryFiles: Readonly<Record<string, string>>;
  groundTruth: GroundTruth;
  namingScheme: NamingScheme;
  probes: readonly ElRsemSelectorProbe[];
}): ElRsemBankPlan {
  assertSanitizedSelectorInputs(args.probes);
  if (args.probes.length === 0) throw new Error("EL Rsem selector requires a non-empty probe bank");

  const probeIds = args.probes.map((probe) => probe.probeId);
  if (new Set(probeIds).size !== probeIds.length) {
    throw new Error("EL Rsem selector received duplicate probe IDs");
  }
  const namingSchemes = new Set(args.probes.map((probe) => probe.namingScheme));
  if (namingSchemes.size !== 1 || !namingSchemes.has(args.namingScheme.schemeId)) {
    throw new Error(
      `EL Rsem selector naming scheme mismatch: probes=[${[...namingSchemes].join(",")}], ` +
        `fixture=${args.namingScheme.schemeId}`
    );
  }

  const unionEntities = [...new Set(
    args.probes.flatMap((probe) => [probe.conditionEntity, probe.requiresEntity])
  )].sort();
  const knownEntities = new Set(args.groundTruth.entities.map((entity) => entity.id));
  const unknown = unionEntities.filter((entity) => !knownEntities.has(entity));
  if (unknown.length > 0) {
    throw new Error(`EL Rsem selector references unknown entities: ${unknown.join(",")}`);
  }

  const repositoryEntries = Object.entries(args.repositoryFiles)
    .map(([rawPath, content]) => ({
      path: normalizeRepositoryPath(rawPath),
      content,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const entityFilePaths = deriveEntityFilePathMap(
    args.groundTruth.entities.map((entity) => entity.id),
    args.namingScheme,
    repositoryEntries.map((entry) => entry.path)
  );
  const entitiesByPath = new Map<string, EntityId[]>();
  for (const [entity, paths] of Object.entries(entityFilePaths) as Array<[EntityId, string[]]>) {
    for (const filePath of paths) {
      const current = entitiesByPath.get(filePath) ?? [];
      current.push(entity);
      current.sort();
      entitiesByPath.set(filePath, current);
    }
  }

  const distances = computeDependencyEntityDistances(
    args.groundTruth,
    {},
    new Set(unionEntities)
  );
  const union = new Set(unionEntities);
  const ranked = repositoryEntries.map(({ path, content }) => {
    const mappedEntities = entitiesByPath.get(path) ?? [];
    const semanticRelevant = mappedEntities.some((entity) => union.has(entity));
    const finiteDistances = mappedEntities
      .map((entity) => distances.get(entity))
      .filter((distance): distance is number => distance !== undefined);
    return {
      path,
      category: classifyArtifactFile(path, content),
      semanticRelevant,
      dependencyDistance: finiteDistances.length > 0 ? Math.min(...finiteDistances) : null,
    };
  });

  ranked.sort((a, b) => {
    const categoryDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
    if (categoryDiff !== 0) return categoryDiff;
    if (a.category === "implementation") {
      const relevanceDiff = Number(b.semanticRelevant) - Number(a.semanticRelevant);
      if (relevanceDiff !== 0) return relevanceDiff;
      const aDistance = a.dependencyDistance ?? Number.MAX_SAFE_INTEGER;
      const bDistance = b.dependencyDistance ?? Number.MAX_SAFE_INTEGER;
      if (aDistance !== bDistance) return aDistance - bDistance;
    }
    return a.path.localeCompare(b.path);
  });

  const rankedPaths = ranked.map(({ path, category }) => ({ path, category }));
  const planInputSha256 = sha256(JSON.stringify({
    selectorVersion: EL_RSEM_BANK_SELECTOR_VERSION,
    rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    probeIds: [...probeIds].sort(),
    namingScheme: args.namingScheme.schemeId,
    unionEntities,
    rankedPaths,
  }));

  return {
    selectorVersion: EL_RSEM_BANK_SELECTOR_VERSION,
    rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    probeIds: [...probeIds].sort(),
    namingScheme: args.namingScheme.schemeId,
    unionEntities,
    rankedPaths,
    planInputSha256,
  };
}

export function buildElRsemBankStaticExposure(args: {
  repositoryFiles: Readonly<Record<string, string>>;
  plan: ElRsemBankPlan;
  budgetTokens: number;
  maxTokensPerUnit: number;
}): ElStaticExposureResult {
  return buildStaticExposureFromRankedPaths({
    repositoryFiles: args.repositoryFiles,
    rankedPaths: args.plan.rankedPaths,
    selectorPolicyVersion: args.plan.selectorVersion,
    rankingPolicyVersion: args.plan.rankingPolicyVersion,
    budgetTokens: args.budgetTokens,
    maxTokensPerUnit: args.maxTokensPerUnit,
  });
}

function assertSanitizedSelectorInputs(probes: readonly ElRsemSelectorProbe[]): void {
  const allowed = new Set([
    "probeId",
    "namingScheme",
    "designVersion",
    "conditionEntity",
    "requiresEntity",
  ]);
  for (const probe of probes) {
    for (const key of Object.keys(probe as object)) {
      if (!allowed.has(key)) {
        throw new Error(
          `EL Rsem selector received forbidden/unversioned probe field ${key} on ${probe.probeId}`
        );
      }
    }
  }
}

function readEntityRelation(
  value: unknown,
  probeId: string,
  key: string
): EntityId {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`EL Rsem probe ${probeId} is missing derivedFrom.${key}`);
  }
  const entity = (value as Record<string, unknown>).entity;
  if (typeof entity !== "string" || entity.length === 0) {
    throw new Error(`EL Rsem probe ${probeId} has invalid derivedFrom.${key}.entity`);
  }
  return entity as EntityId;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
