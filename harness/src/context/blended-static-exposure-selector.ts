import type { ArtifactFileCategory } from "../measurement/file-classification";
import { chunkArtifactFile } from "../measurement/artifact-unit";
import { countCanonicalTokens } from "../measurement/token-counter";
import type {
  PrivilegedRetrievalPlan,
  PrivilegedRetrievalPlanEntry,
} from "./privileged-retrieval-controller";
import type { StaticExposureOrderedUnit } from "./static-exposure";

export const BLENDED_STATIC_EXPOSURE_POLICY_VERSION =
  "p6-3-v3-category-proportional-interleave-prototype-v1" as const;

const CATEGORY_ORDER: readonly ArtifactFileCategory[] = [
  "type_definition",
  "fixed_contract",
  "test",
  "implementation",
];

interface PendingUnit {
  entry: PrivilegedRetrievalPlanEntry;
  unit: ReturnType<typeof chunkArtifactFile>[number];
  contentTokens: number;
}

export interface BlendedStaticExposurePlan {
  policyVersion: typeof BLENDED_STATIC_EXPOSURE_POLICY_VERSION;
  orderedUnits: StaticExposureOrderedUnit[];
  categoryFullContentTokens: Record<ArtifactFileCategory, number>;
  categoryUnitCounts: Record<ArtifactFileCategory, number>;
}

/**
 * Prototype for the P6-3 v3 selector design audit.
 *
 * The historical PR/EL ranking remains the within-category ordering authority,
 * but category is no longer an absolute blocking key. Instead, the four
 * category queues are progressively interleaved so that cumulative selected
 * content approximates each category's share of the full repository.
 *
 * This function intentionally accepts no scientific outcome data. Its inputs
 * are restricted to the frozen privileged structural ranking, repository
 * content, and the artifact-unit chunk size.
 */
export function buildCategoryProportionalBlendedOrder(args: {
  ranking: PrivilegedRetrievalPlan;
  repositoryFiles: Readonly<Record<string, string>>;
  maxTokensPerUnit: number;
}): BlendedStaticExposurePlan {
  if (!Number.isInteger(args.maxTokensPerUnit) || args.maxTokensPerUnit <= 0) {
    throw new Error("blended selector maxTokensPerUnit must be a positive integer");
  }

  const queues = emptyCategoryQueues();
  const categoryFullContentTokens = emptyCategoryNumberRecord();
  const categoryUnitCounts = emptyCategoryNumberRecord();
  const seenPaths = new Set<string>();

  for (const entry of args.ranking.entries) {
    if (seenPaths.has(entry.path)) {
      throw new Error(`blended selector ranking contains duplicate path: ${entry.path}`);
    }
    seenPaths.add(entry.path);
    const content = args.repositoryFiles[entry.path];
    if (content === undefined) {
      throw new Error(`blended selector ranking references missing repository path: ${entry.path}`);
    }

    categoryFullContentTokens[entry.category] += countCanonicalTokens(content);
    const chunks = chunkArtifactFile(entry.path, content, args.maxTokensPerUnit);
    for (const unit of chunks) {
      queues[entry.category].push({
        entry,
        unit,
        contentTokens: Math.max(1, countCanonicalTokens(unit.content)),
      });
      categoryUnitCounts[entry.category] += 1;
    }
  }

  const repositoryPaths = Object.keys(args.repositoryFiles).sort();
  const rankedPaths = [...seenPaths].sort();
  if (JSON.stringify(repositoryPaths) !== JSON.stringify(rankedPaths)) {
    throw new Error("blended selector ranking must cover the repository exactly once");
  }

  const served = emptyCategoryNumberRecord();
  const orderedUnits: StaticExposureOrderedUnit[] = [];

  while (CATEGORY_ORDER.some((category) => queues[category].length > 0)) {
    const category = chooseNextCategory(queues, served, categoryFullContentTokens);
    const pending = queues[category].shift();
    if (!pending) {
      throw new Error(`blended selector internal queue underflow: ${category}`);
    }
    served[category] += pending.contentTokens;
    orderedUnits.push({
      unit: pending.unit,
      selectorSequence: orderedUnits.length,
      category,
      mappedEntities: [...pending.entry.mappedEntities],
      semanticRelevant: pending.entry.semanticRelevant,
      dependencyDistance: pending.entry.dependencyDistance,
    });
  }

  return {
    policyVersion: BLENDED_STATIC_EXPOSURE_POLICY_VERSION,
    orderedUnits,
    categoryFullContentTokens,
    categoryUnitCounts,
  };
}

function chooseNextCategory(
  queues: Record<ArtifactFileCategory, PendingUnit[]>,
  served: Record<ArtifactFileCategory, number>,
  full: Record<ArtifactFileCategory, number>
): ArtifactFileCategory {
  const candidates = CATEGORY_ORDER.filter((category) => queues[category].length > 0);
  if (candidates.length === 0) {
    throw new Error("blended selector has no remaining category");
  }

  let best = candidates[0];
  let bestProjected = projectedNormalizedLoad(best, queues, served, full);
  for (const category of candidates.slice(1)) {
    const projected = projectedNormalizedLoad(category, queues, served, full);
    if (projected < bestProjected) {
      best = category;
      bestProjected = projected;
    }
  }
  return best;
}

function projectedNormalizedLoad(
  category: ArtifactFileCategory,
  queues: Record<ArtifactFileCategory, PendingUnit[]>,
  served: Record<ArtifactFileCategory, number>,
  full: Record<ArtifactFileCategory, number>
): number {
  const next = queues[category][0];
  if (!next) return Number.POSITIVE_INFINITY;
  const denominator = Math.max(1, full[category]);
  return (served[category] + next.contentTokens) / denominator;
}

function emptyCategoryNumberRecord(): Record<ArtifactFileCategory, number> {
  return {
    type_definition: 0,
    fixed_contract: 0,
    test: 0,
    implementation: 0,
  };
}

function emptyCategoryQueues(): Record<ArtifactFileCategory, PendingUnit[]> {
  return {
    type_definition: [],
    fixed_contract: [],
    test: [],
    implementation: [],
  };
}
