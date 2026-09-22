import * as crypto from "crypto";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../../../synthetic-world/schema";
import {
  chunkArtifactFile,
  type ArtifactUnit,
} from "../measurement/artifact-unit";
import type { ArtifactFileCategory } from "../measurement/file-classification";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "../measurement/token-counter";
import {
  buildPrivilegedRetrievalPlan,
  PRIVILEGED_RETRIEVAL_POLICY_VERSION,
} from "./privileged-retrieval-controller";

export const EL_STATIC_EXPOSURE_SCHEMA_VERSION = "el-static-exposure-v1" as const;
export const EL_STATIC_REPOSITORY_SERIALIZER_VERSION =
  "af-compatible-static-repository-payload-v1" as const;
export const EL_TASK_SELECTOR_VERSION =
  `el-task-prefix-from-${PRIVILEGED_RETRIEVAL_POLICY_VERSION}-v1` as const;

export interface StaticExposureRankedPath {
  path: string;
  category: ArtifactFileCategory;
}

export interface ElStaticExposureUnitLog {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  category: ArtifactFileCategory;
  contentSha256: string;
  marginalPayloadTokens: number;
}

export interface ElStaticExposureCategoryStats {
  units: number;
  marginalPayloadTokens: number;
}

export interface ElStaticExposureLog {
  schemaVersion: typeof EL_STATIC_EXPOSURE_SCHEMA_VERSION;
  selectorPolicyVersion: string;
  rankingPolicyVersion: string | null;
  staticRepositorySerializerVersion: typeof EL_STATIC_REPOSITORY_SERIALIZER_VERSION;
  canonicalTokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
  nominalBudgetTokens: number;
  actualPayloadTokens: number;
  fullPayloadTokens: number;
  maxTokensPerUnit: number;
  orderedPlanSha256: string;
  exposureSha256: string;
  rankedPaths: string[];
  orderedUnitIds: string[];
  selectedUnitIds: string[];
  selectedUnits: ElStaticExposureUnitLog[];
  categoryStats: Record<ArtifactFileCategory, ElStaticExposureCategoryStats>;
}

export interface ElStaticExposureResult {
  contextFiles: Record<string, string>;
  log: ElStaticExposureLog;
}

/**
 * Serialize only the static repository artifact payload shown inside the existing
 * Stage 1 AF/MOI user-prompt repository section. The CURRENT REPOSITORY heading,
 * task text, system prompt, and output schema are constant overhead and are not
 * charged to B_expose.
 *
 * This intentionally mirrors buildOpenAIUserMessage(): contextFiles are rendered
 * in path-sorted order as "--- path ---" blocks. P6-3 offline parity tests must
 * fail if that backend framing ever changes without a corresponding serializer
 * version change.
 */
export function serializeStaticRepositoryPayload(
  contextFiles: Readonly<Record<string, string>>
): string {
  return Object.keys(contextFiles)
    .sort()
    .map((filePath) => `\n--- ${filePath} ---\n${contextFiles[filePath]}\n`)
    .join("");
}

export function countStaticRepositoryPayloadTokens(
  contextFiles: Readonly<Record<string, string>>
): number {
  return countCanonicalTokens(serializeStaticRepositoryPayload(contextFiles));
}

export function buildElTaskStaticExposure(args: {
  repositoryFiles: Readonly<Record<string, string>>;
  groundTruth: GroundTruth;
  delta: GroundTruthDelta;
  namingScheme: NamingScheme;
  budgetTokens: number;
  maxTokensPerUnit: number;
}): ElStaticExposureResult {
  const retrievalPlan = buildPrivilegedRetrievalPlan({
    groundTruth: args.groundTruth,
    delta: args.delta,
    namingScheme: args.namingScheme,
    repositoryFiles: args.repositoryFiles,
  });
  return buildStaticExposureFromRankedPaths({
    repositoryFiles: args.repositoryFiles,
    rankedPaths: retrievalPlan.entries.map((entry) => ({
      path: entry.path,
      category: entry.category,
    })),
    selectorPolicyVersion: EL_TASK_SELECTOR_VERSION,
    rankingPolicyVersion: retrievalPlan.policyVersion,
    budgetTokens: args.budgetTokens,
    maxTokensPerUnit: args.maxTokensPerUnit,
  });
}

/**
 * Shared static-prefix builder. M uses PR's task-aware privileged file ranking;
 * the later Rsem bank-level selector can provide its own frozen ranked path list
 * while reusing identical chunk/prefix/budget semantics.
 */
export function buildStaticExposureFromRankedPaths(args: {
  repositoryFiles: Readonly<Record<string, string>>;
  rankedPaths: readonly StaticExposureRankedPath[];
  selectorPolicyVersion: string;
  rankingPolicyVersion?: string | null;
  budgetTokens: number;
  maxTokensPerUnit: number;
}): ElStaticExposureResult {
  assertNonNegativeInteger(args.budgetTokens, "EL B_expose");
  assertPositiveInteger(args.maxTokensPerUnit, "EL maxTokensPerUnit");

  const normalizedRankedPaths = validateRankedPaths(args.repositoryFiles, args.rankedPaths);
  const rankedUnits = normalizedRankedPaths.flatMap((entry) =>
    chunkArtifactFile(
      entry.path,
      args.repositoryFiles[entry.path],
      args.maxTokensPerUnit
    ).map((unit) => ({ unit, category: entry.category }))
  );

  const fullPayloadTokens = countStaticRepositoryPayloadTokens(args.repositoryFiles);
  const orderedPlanSha256 = sha256(
    JSON.stringify({
      selectorPolicyVersion: args.selectorPolicyVersion,
      rankingPolicyVersion: args.rankingPolicyVersion ?? null,
      maxTokensPerUnit: args.maxTokensPerUnit,
      rankedPaths: normalizedRankedPaths,
      units: rankedUnits.map(({ unit, category }) => ({
        id: unit.id,
        path: unit.path,
        startLine: unit.startLine,
        endLine: unit.endLine,
        category,
        contentSha256: sha256(unit.content),
      })),
    })
  );

  const contextFiles: Record<string, string> = {};
  const selectedUnits: ElStaticExposureUnitLog[] = [];
  let actualPayloadTokens = 0;

  for (const { unit, category } of rankedUnits) {
    const candidate = appendUnit(contextFiles, unit);
    const candidateTokens = countStaticRepositoryPayloadTokens(candidate);
    if (candidateTokens < actualPayloadTokens) {
      throw new Error(
        `EL static payload token count decreased after adding ${unit.id}: ` +
          `${actualPayloadTokens} -> ${candidateTokens}`
      );
    }
    if (candidateTokens > args.budgetTokens) break;

    const marginalPayloadTokens = candidateTokens - actualPayloadTokens;
    replaceRecord(contextFiles, candidate);
    actualPayloadTokens = candidateTokens;
    selectedUnits.push({
      id: unit.id,
      path: unit.path,
      startLine: unit.startLine,
      endLine: unit.endLine,
      category,
      contentSha256: sha256(unit.content),
      marginalPayloadTokens,
    });
  }

  const staticPayload = serializeStaticRepositoryPayload(contextFiles);
  const exposureSha256 = sha256(staticPayload);
  const categoryStats = emptyCategoryStats();
  for (const selected of selectedUnits) {
    categoryStats[selected.category].units += 1;
    categoryStats[selected.category].marginalPayloadTokens += selected.marginalPayloadTokens;
  }

  return {
    contextFiles,
    log: {
      schemaVersion: EL_STATIC_EXPOSURE_SCHEMA_VERSION,
      selectorPolicyVersion: args.selectorPolicyVersion,
      rankingPolicyVersion: args.rankingPolicyVersion ?? null,
      staticRepositorySerializerVersion: EL_STATIC_REPOSITORY_SERIALIZER_VERSION,
      canonicalTokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
      nominalBudgetTokens: args.budgetTokens,
      actualPayloadTokens,
      fullPayloadTokens,
      maxTokensPerUnit: args.maxTokensPerUnit,
      orderedPlanSha256,
      exposureSha256,
      rankedPaths: normalizedRankedPaths.map((entry) => entry.path),
      orderedUnitIds: rankedUnits.map(({ unit }) => unit.id),
      selectedUnitIds: selectedUnits.map((unit) => unit.id),
      selectedUnits,
      categoryStats,
    },
  };
}

function validateRankedPaths(
  repositoryFiles: Readonly<Record<string, string>>,
  rankedPaths: readonly StaticExposureRankedPath[]
): StaticExposureRankedPath[] {
  const seen = new Set<string>();
  const result: StaticExposureRankedPath[] = [];
  for (const entry of rankedPaths) {
    if (!Object.prototype.hasOwnProperty.call(repositoryFiles, entry.path)) {
      throw new Error(`EL ranked path is not present in repository snapshot: ${entry.path}`);
    }
    if (seen.has(entry.path)) {
      throw new Error(`EL ranked path is duplicated: ${entry.path}`);
    }
    seen.add(entry.path);
    result.push({ ...entry });
  }
  if (seen.size !== Object.keys(repositoryFiles).length) {
    const omitted = Object.keys(repositoryFiles).filter((filePath) => !seen.has(filePath));
    throw new Error(`EL ranking must cover the full repository; omitted: ${omitted.join(", ")}`);
  }
  return result;
}

function appendUnit(
  current: Readonly<Record<string, string>>,
  unit: ArtifactUnit
): Record<string, string> {
  return {
    ...current,
    [unit.path]: `${current[unit.path] ?? ""}${unit.content}`,
  };
}

function replaceRecord(
  target: Record<string, string>,
  source: Readonly<Record<string, string>>
): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function emptyCategoryStats(): Record<ArtifactFileCategory, ElStaticExposureCategoryStats> {
  return {
    type_definition: { units: 0, marginalPayloadTokens: 0 },
    fixed_contract: { units: 0, marginalPayloadTokens: 0 },
    test: { units: 0, marginalPayloadTokens: 0 },
    implementation: { units: 0, marginalPayloadTokens: 0 },
  };
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}`);
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
