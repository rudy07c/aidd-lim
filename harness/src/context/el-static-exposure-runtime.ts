import * as fs from "fs";
import * as path from "path";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../../../synthetic-world/schema";
import { chunkArtifactFile } from "../measurement/artifact-unit";
import type { RunConfig } from "../types";
import {
  buildPrivilegedRetrievalPlan,
  PRIVILEGED_RETRIEVAL_POLICY_VERSION,
} from "./privileged-retrieval-controller";
import {
  buildStaticExposurePrefix,
  StaticExposureOrderedUnit,
  StaticExposurePrefixResult,
} from "./static-exposure";

export const EL_TASK_SELECTOR_VERSION =
  "p6-3-el-task-selector-pr-ranking-v1" as const;

export interface ELTaskDescriptor {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

/**
 * Build the one-shot static repository exposure for an EL mutation task.
 * Evaluator-side privileged data is used only to rank repository files before
 * the episode starts. The worker receives only the resulting static contextFiles
 * and has no repository retrieval path afterwards.
 */
export function assembleELTaskStaticExposure(args: {
  config: RunConfig;
  task: ELTaskDescriptor;
  repositoryFiles: Readonly<Record<string, string>>;
}): StaticExposurePrefixResult {
  const { config, task, repositoryFiles } = args;
  if (config.condition !== "EL") {
    throw new Error(`EL static exposure runtime received condition ${config.condition}`);
  }
  if (
    typeof config.contextBudget !== "number" ||
    !Number.isInteger(config.contextBudget) ||
    config.contextBudget < 0
  ) {
    throw new Error("EL requires a non-negative integer contextBudget representing B_expose");
  }
  const maxTokensPerUnit = config.staticExposureMaxTokensPerUnit;
  if (
    typeof maxTokensPerUnit !== "number" ||
    !Number.isInteger(maxTokensPerUnit) ||
    maxTokensPerUnit <= 0
  ) {
    throw new Error("EL requires a positive integer staticExposureMaxTokensPerUnit");
  }
  if (!task.groundTruthDelta) {
    throw new Error(`EL task ${task.taskId} is missing GroundTruthDelta`);
  }
  if (!task.namingScheme) {
    throw new Error(`EL task ${task.taskId} is missing namingScheme`);
  }

  const { groundTruth, namingScheme } = loadPrivilegedInputs(
    config.syntheticWorldDir,
    task.namingScheme
  );
  const ranking = buildPrivilegedRetrievalPlan({
    groundTruth,
    delta: task.groundTruthDelta,
    namingScheme,
    repositoryFiles,
  });

  const orderedUnits: StaticExposureOrderedUnit[] = [];
  for (const entry of ranking.entries) {
    const content = repositoryFiles[entry.path];
    if (content === undefined) {
      throw new Error(`EL ranking references repository path not present in snapshot: ${entry.path}`);
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
    selectorKind: "task-privileged-ranking",
    selectorId: `${EL_TASK_SELECTOR_VERSION}:${task.taskId}`,
    rankingPolicyVersion: PRIVILEGED_RETRIEVAL_POLICY_VERSION,
  });
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
    throw new Error(`Naming scheme not found for EL task: ${namingSchemeId}`);
  }
  return { groundTruth, namingScheme };
}
