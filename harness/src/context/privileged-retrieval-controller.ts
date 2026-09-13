import {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
  EntityId,
  applyDelta,
} from "../../../synthetic-world/schema";
import {
  computeSemanticLocality,
  computeSurfaceLocality,
} from "../../../synthetic-world/semantic_locality";
import {
  ArtifactFileCategory,
  classifyArtifactFile,
  normalizeRepositoryPath,
} from "../measurement/file-classification";
import {
  BudgetedRepositoryGateway,
  BudgetedRetrievalResult,
} from "../repository/retrieval-gateway";

export const PRIVILEGED_RETRIEVAL_POLICY_VERSION =
  "ground-truth-dependency-system2-v1" as const;

const CATEGORY_PRIORITY: Record<ArtifactFileCategory, number> = {
  type_definition: 0,
  fixed_contract: 1,
  test: 2,
  implementation: 3,
};

export interface PrivilegedRetrievalPlanEntry {
  sequence: number;
  path: string;
  category: ArtifactFileCategory;
  mappedEntities: EntityId[];
  semanticRelevant: boolean;
  /** null means no path through the explicit Dependency graph from a surface entity. */
  dependencyDistance: number | null;
}

export interface PrivilegedRetrievalPlan {
  policyVersion: typeof PRIVILEGED_RETRIEVAL_POLICY_VERSION;
  surfaceEntities: EntityId[];
  semanticEntities: EntityId[];
  entityFilePaths: Record<EntityId, string[]>;
  dependencyDistances: Record<EntityId, number | null>;
  entries: PrivilegedRetrievalPlanEntry[];
}

export interface PrivilegedRetrievalControllerOptions {
  groundTruth: GroundTruth;
  delta: GroundTruthDelta;
  namingScheme: NamingScheme;
  repositoryFiles: Readonly<Record<string, string>>;
  gateway: BudgetedRepositoryGateway;
}

export interface PrivilegedRetrievalExecution {
  planEntry: PrivilegedRetrievalPlanEntry;
  retrieval: BudgetedRetrievalResult;
}

/**
 * Derive EntityId -> repository file paths from the active NamingScheme rather
 * than from a hand-written table. Under the synthetic-world source convention,
 * an entity display name such as Vok owns files below src/vok/.
 *
 * Existing repository paths are intersected with that mechanically-derived
 * prefix, so worlds may add/remove per-entity files without changing policy code.
 */
export function deriveEntityFilePathMap(
  entityIds: readonly EntityId[],
  namingScheme: NamingScheme,
  repositoryPaths: readonly string[]
): Record<EntityId, string[]> {
  const normalizedPaths = repositoryPaths
    .map(normalizeRepositoryPath)
    .sort((a, b) => a.localeCompare(b));
  const result: Record<EntityId, string[]> = {};

  for (const entityId of [...entityIds].sort()) {
    const displayName = namingScheme.entityNames[entityId];
    if (!displayName) {
      throw new Error(
        `Naming scheme ${namingScheme.schemeId} has no entity name for ${entityId}`
      );
    }
    const sourceDir = displayName.toLocaleLowerCase("en-US");
    if (!/^[a-z0-9_-]+$/.test(sourceDir)) {
      throw new Error(
        `Entity display name cannot be mapped to synthetic source directory: ${displayName}`
      );
    }
    const prefix = `src/${sourceDir}/`;
    result[entityId] = normalizedPaths.filter((filePath) => filePath.startsWith(prefix));
  }
  return result;
}

/**
 * Shortest undirected entity distance induced by explicit GroundTruth
 * Dependency edges. A dependency operation->entity becomes an entity edge from
 * every effect entity of that operation to dep.on. Delta additions are applied
 * first, so the current task's dependency declarations participate in ranking.
 */
export function computeDependencyEntityDistances(
  groundTruth: GroundTruth,
  delta: GroundTruthDelta,
  roots: ReadonlySet<EntityId>
): Map<EntityId, number> {
  const gNext = applyDelta(groundTruth, delta);
  const adjacency = new Map<EntityId, Set<EntityId>>();
  for (const entity of gNext.entities) adjacency.set(entity.id, new Set());

  const transitionByOperation = new Map(
    gNext.transitions.map((transition) => [transition.operationId, transition] as const)
  );
  for (const dependency of gNext.dependencies) {
    const transition = transitionByOperation.get(dependency.from);
    if (!transition) {
      throw new Error(
        `Dependency ${dependency.id} references transitionless operation ${dependency.from}`
      );
    }
    if (!adjacency.has(dependency.on)) {
      throw new Error(
        `Dependency ${dependency.id} references unknown entity ${dependency.on}`
      );
    }
    for (const effect of transition.effects) {
      if (!adjacency.has(effect.entity)) {
        throw new Error(
          `Transition ${transition.operationId} affects unknown entity ${effect.entity}`
        );
      }
      adjacency.get(effect.entity)!.add(dependency.on);
      adjacency.get(dependency.on)!.add(effect.entity);
    }
  }

  const distances = new Map<EntityId, number>();
  const queue: EntityId[] = [];
  for (const root of [...roots].sort()) {
    if (!adjacency.has(root)) continue;
    distances.set(root, 0);
    queue.push(root);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextDistance = distances.get(current)! + 1;
    const neighbors = [...(adjacency.get(current) ?? [])].sort();
    for (const neighbor of neighbors) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }
  return distances;
}

/**
 * Stage 1 P5 privileged ranking. It reuses computeSemanticLocality() for the
 * evaluator-side relevant entity set, then uses explicit Dependency-graph
 * distance only to order implementation logic. The category order follows the
 * historical system2 selector: types -> fixed protocol -> tests -> implementation.
 */
export function buildPrivilegedRetrievalPlan(args: {
  groundTruth: GroundTruth;
  delta: GroundTruthDelta;
  namingScheme: NamingScheme;
  repositoryFiles: Readonly<Record<string, string>>;
}): PrivilegedRetrievalPlan {
  const gNext = applyDelta(args.groundTruth, args.delta);
  const surface = computeSurfaceLocality(args.delta);
  const semantic = computeSemanticLocality(args.groundTruth, args.delta);
  const distances = computeDependencyEntityDistances(
    args.groundTruth,
    args.delta,
    surface
  );

  const repositoryEntries = Object.entries(args.repositoryFiles)
    .map(([rawPath, content]) => ({
      path: normalizeRepositoryPath(rawPath),
      content,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const entityFilePaths = deriveEntityFilePathMap(
    gNext.entities.map((entity) => entity.id),
    args.namingScheme,
    repositoryEntries.map((entry) => entry.path)
  );

  const entitiesByPath = new Map<string, EntityId[]>();
  for (const [entityId, paths] of Object.entries(entityFilePaths)) {
    for (const filePath of paths) {
      const current = entitiesByPath.get(filePath) ?? [];
      current.push(entityId);
      current.sort();
      entitiesByPath.set(filePath, current);
    }
  }

  const ranked = repositoryEntries.map(({ path, content }) => {
    const mappedEntities = [...(entitiesByPath.get(path) ?? [])];
    const semanticRelevant = mappedEntities.some((entity) => semantic.has(entity));
    const finiteDistances = mappedEntities
      .map((entity) => distances.get(entity))
      .filter((distance): distance is number => distance !== undefined);
    const dependencyDistance =
      finiteDistances.length > 0 ? Math.min(...finiteDistances) : null;
    return {
      path,
      category: classifyArtifactFile(path, content),
      mappedEntities,
      semanticRelevant,
      dependencyDistance,
    };
  });

  ranked.sort((a, b) => {
    const categoryDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
    if (categoryDiff !== 0) return categoryDiff;

    // system2's relevance/distance semantics only order implementation logic.
    if (a.category === "implementation") {
      const relevanceDiff = Number(b.semanticRelevant) - Number(a.semanticRelevant);
      if (relevanceDiff !== 0) return relevanceDiff;
      const aDistance = a.dependencyDistance ?? Number.MAX_SAFE_INTEGER;
      const bDistance = b.dependencyDistance ?? Number.MAX_SAFE_INTEGER;
      if (aDistance !== bDistance) return aDistance - bDistance;
    }
    return a.path.localeCompare(b.path);
  });

  const dependencyDistances: Record<EntityId, number | null> = {};
  for (const entity of [...gNext.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    dependencyDistances[entity.id] = distances.get(entity.id) ?? null;
  }

  return {
    policyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
    surfaceEntities: [...surface].sort(),
    semanticEntities: [...semantic].sort(),
    entityFilePaths,
    dependencyDistances,
    entries: ranked.map((entry, sequence) => ({ sequence, ...entry })),
  };
}

/**
 * PR-only deterministic selector. It has privileged evaluator-side access to the
 * ranking inputs, but repository evidence reaches the worker only through the
 * same BudgetedRepositoryGateway used by AR. Therefore every actual read still
 * consumes E_max before access and is admitted through B_work afterwards.
 *
 * This class intentionally performs one retrieval at a time. P5 Step 6 can
 * interleave the same common research-stateless episode loop with retrieveNext().
 */
export class PrivilegedRetrievalController {
  readonly retrievalPlan: PrivilegedRetrievalPlan;
  private cursor = 0;

  constructor(private readonly options: PrivilegedRetrievalControllerOptions) {
    this.retrievalPlan = buildPrivilegedRetrievalPlan(options);
  }

  hasNext(): boolean {
    return this.cursor < this.retrievalPlan.entries.length;
  }

  nextEntry(): PrivilegedRetrievalPlanEntry | null {
    const entry = this.retrievalPlan.entries[this.cursor];
    return entry ? clonePlanEntry(entry) : null;
  }

  async retrieveNext(): Promise<PrivilegedRetrievalExecution | null> {
    const entry = this.retrievalPlan.entries[this.cursor];
    if (!entry) return null;

    // Cursor advances only after the gateway transaction succeeds. A pending
    // retrieval or exhausted E_max therefore cannot silently skip a ranked file.
    const retrieval = await this.options.gateway.readChunk({ path: entry.path });
    this.cursor += 1;
    return {
      planEntry: clonePlanEntry(entry),
      retrieval,
    };
  }

  position(): number {
    return this.cursor;
  }
}

function clonePlanEntry(entry: PrivilegedRetrievalPlanEntry): PrivilegedRetrievalPlanEntry {
  return {
    ...entry,
    mappedEntities: [...entry.mappedEntities],
  };
}
