import * as crypto from "crypto";
import type { ArtifactFileCategory } from "../measurement/file-classification";
import type { ArtifactUnit } from "../measurement/artifact-unit";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "../measurement/token-counter";

export const STATIC_EXPOSURE_SCHEMA_VERSION = "p6-3-static-exposure-v1" as const;
export const STATIC_REPOSITORY_SERIALIZER_VERSION =
  "p6-3-static-repository-payload-v1" as const;
export const STATIC_EXPOSURE_UNIT_MAPPING_VERSION =
  "p6-3-ranked-file-source-chunks-v1" as const;

const ARTIFACT_CATEGORIES: ArtifactFileCategory[] = [
  "type_definition",
  "fixed_contract",
  "test",
  "implementation",
];

export interface StaticExposureOrderedUnit {
  unit: ArtifactUnit;
  selectorSequence: number;
  category: ArtifactFileCategory;
  mappedEntities: string[];
  semanticRelevant: boolean;
  dependencyDistance: number | null;
}

export interface StaticExposureUnitProvenance {
  unitId: string;
  path: string;
  startLine: number;
  endLine: number;
  contentHash: string;
  selectorSequence: number;
  category: ArtifactFileCategory;
  mappedEntities: string[];
  semanticRelevant: boolean;
  dependencyDistance: number | null;
}

export interface ELStaticExposureLog {
  schemaVersion: typeof STATIC_EXPOSURE_SCHEMA_VERSION;
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
  staticRepositorySerializerVersion: typeof STATIC_REPOSITORY_SERIALIZER_VERSION;
  artifactUnitMappingVersion: typeof STATIC_EXPOSURE_UNIT_MAPPING_VERSION;
  artifactChunkerVersion: string;
  selectorKind: string;
  selectorId: string;
  rankingPolicyVersion: string;
  budgetTokens: number;
  actualExposedTokens: number;
  fullRepositoryTokens: number;
  maxTokensPerUnit: number;
  orderedUnitCount: number;
  selectedUnitCount: number;
  selectorPlanHash: string;
  exposureSetHash: string;
  staticPayloadHash: string;
  selectedFilePaths: string[];
  selectedUnits: StaticExposureUnitProvenance[];
  categoryUnitCounts: Record<ArtifactFileCategory, number>;
  categoryStaticPayloadTokens: Record<ArtifactFileCategory, number>;
}

export interface StaticExposurePrefixResult {
  contextFiles: Record<string, string>;
  log: ELStaticExposureLog;
  orderedUnitIds: string[];
  selectedUnitIds: string[];
}

/**
 * Exact repository artifact payload appended by buildOpenAIUserMessage() after
 * the `CURRENT REPOSITORY:` heading. This intentionally excludes the task,
 * system prompt, heading itself and output schema because those are constant
 * across P6-3 budget arms.
 */
export function serializeStaticRepositoryPayload(
  files: Readonly<Record<string, string>>
): string {
  let payload = "";
  for (const filePath of Object.keys(files).sort()) {
    payload += `\n--- ${filePath} ---\n${files[filePath]}\n`;
  }
  return payload;
}

export function countStaticRepositoryPayloadTokens(
  files: Readonly<Record<string, string>>
): number {
  return countCanonicalTokens(serializeStaticRepositoryPayload(files));
}

/**
 * Select the largest whole-unit prefix whose final AF-compatible static
 * repository serialization fits the requested B_expose. Units that do not fit
 * stop the prefix; later units are never skipped in.
 */
export function buildStaticExposurePrefix(args: {
  orderedUnits: readonly StaticExposureOrderedUnit[];
  fullRepositoryFiles: Readonly<Record<string, string>>;
  budgetTokens: number;
  maxTokensPerUnit: number;
  artifactChunkerVersion: string;
  selectorKind: string;
  selectorId: string;
  rankingPolicyVersion: string;
}): StaticExposurePrefixResult {
  if (!Number.isInteger(args.budgetTokens) || args.budgetTokens < 0) {
    throw new Error("B_expose must be a non-negative integer canonical token budget");
  }
  if (!Number.isInteger(args.maxTokensPerUnit) || args.maxTokensPerUnit <= 0) {
    throw new Error("static exposure maxTokensPerUnit must be a positive integer");
  }
  if (!args.artifactChunkerVersion) {
    throw new Error("static exposure artifactChunkerVersion must be non-empty");
  }

  const selected: StaticExposureOrderedUnit[] = [];
  let contextFiles: Record<string, string> = {};
  let actualExposedTokens = 0;

  for (const ordered of args.orderedUnits) {
    const candidate = [...selected, ordered];
    const candidateFiles = contextFilesFromOrderedUnits(candidate);
    const candidateTokens = countStaticRepositoryPayloadTokens(candidateFiles);
    if (candidateTokens > args.budgetTokens) break;
    selected.push(ordered);
    contextFiles = candidateFiles;
    actualExposedTokens = candidateTokens;
  }

  const payload = serializeStaticRepositoryPayload(contextFiles);
  const selectedUnits = selected.map(toProvenance);
  const categoryUnitCounts = emptyCategoryRecord();
  const categoryFiles = emptyCategoryFileRecord();
  for (const ordered of selected) {
    categoryUnitCounts[ordered.category] += 1;
    const files = categoryFiles[ordered.category];
    files[ordered.unit.path] = (files[ordered.unit.path] ?? "") + ordered.unit.content;
  }
  const categoryStaticPayloadTokens = emptyCategoryRecord();
  for (const category of ARTIFACT_CATEGORIES) {
    categoryStaticPayloadTokens[category] = countStaticRepositoryPayloadTokens(
      categoryFiles[category]
    );
  }

  return {
    contextFiles,
    orderedUnitIds: args.orderedUnits.map((entry) => entry.unit.id),
    selectedUnitIds: selected.map((entry) => entry.unit.id),
    log: {
      schemaVersion: STATIC_EXPOSURE_SCHEMA_VERSION,
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
      staticRepositorySerializerVersion: STATIC_REPOSITORY_SERIALIZER_VERSION,
      artifactUnitMappingVersion: STATIC_EXPOSURE_UNIT_MAPPING_VERSION,
      artifactChunkerVersion: args.artifactChunkerVersion,
      selectorKind: args.selectorKind,
      selectorId: args.selectorId,
      rankingPolicyVersion: args.rankingPolicyVersion,
      budgetTokens: args.budgetTokens,
      actualExposedTokens,
      fullRepositoryTokens: countStaticRepositoryPayloadTokens(args.fullRepositoryFiles),
      maxTokensPerUnit: args.maxTokensPerUnit,
      orderedUnitCount: args.orderedUnits.length,
      selectedUnitCount: selected.length,
      selectorPlanHash: sha256(JSON.stringify(args.orderedUnits.map(toProvenance))),
      exposureSetHash: sha256(JSON.stringify(selected.map((entry) => entry.unit.id))),
      staticPayloadHash: sha256(payload),
      selectedFilePaths: Object.keys(contextFiles).sort(),
      selectedUnits,
      categoryUnitCounts,
      categoryStaticPayloadTokens,
    },
  };
}

export function contextFilesFromOrderedUnits(
  orderedUnits: readonly StaticExposureOrderedUnit[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const ordered of orderedUnits) {
    result[ordered.unit.path] = (result[ordered.unit.path] ?? "") + ordered.unit.content;
  }
  return result;
}

function toProvenance(ordered: StaticExposureOrderedUnit): StaticExposureUnitProvenance {
  return {
    unitId: ordered.unit.id,
    path: ordered.unit.path,
    startLine: ordered.unit.startLine,
    endLine: ordered.unit.endLine,
    contentHash: sha256(ordered.unit.content),
    selectorSequence: ordered.selectorSequence,
    category: ordered.category,
    mappedEntities: [...ordered.mappedEntities],
    semanticRelevant: ordered.semanticRelevant,
    dependencyDistance: ordered.dependencyDistance,
  };
}

function emptyCategoryRecord(): Record<ArtifactFileCategory, number> {
  return {
    type_definition: 0,
    fixed_contract: 0,
    test: 0,
    implementation: 0,
  };
}

function emptyCategoryFileRecord(): Record<
  ArtifactFileCategory,
  Record<string, string>
> {
  return {
    type_definition: {},
    fixed_contract: {},
    test: {},
    implementation: {},
  };
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
