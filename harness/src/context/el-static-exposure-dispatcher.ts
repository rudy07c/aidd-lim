import * as fs from "fs";
import * as path from "path";
import type {
  GroundTruth,
  GroundTruthDelta,
  NamingScheme,
} from "../../../synthetic-world/schema";
import type { RunConfig } from "../types";
import {
  buildElTaskStaticExposure,
  type ElStaticExposureResult,
} from "./el-static-exposure";

export interface ElStaticExposureTaskDescriptor {
  taskId: string;
  visibleInstruction: string;
  namingScheme?: string;
  groundTruthDelta?: GroundTruthDelta;
}

export function buildElStaticExposureForTask(args: {
  config: RunConfig;
  task: ElStaticExposureTaskDescriptor;
  repositoryFiles: Readonly<Record<string, string>>;
}): ElStaticExposureResult {
  const { config, task, repositoryFiles } = args;
  if (config.condition !== "EL") {
    throw new Error(`EL static exposure dispatcher received ${config.condition}`);
  }
  if (typeof config.contextBudget !== "number") {
    throw new Error("EL requires numeric B_expose in contextBudget");
  }
  const maxTokensPerUnit = config.staticExposureMaxTokensPerUnit;
  if (!Number.isInteger(maxTokensPerUnit) || (maxTokensPerUnit ?? 0) <= 0) {
    throw new Error(
      "EL requires positive integer staticExposureMaxTokensPerUnit frozen before live execution"
    );
  }

  const privileged = loadElPrivilegedInputs(config.syntheticWorldDir, task);
  return buildElTaskStaticExposure({
    repositoryFiles,
    groundTruth: privileged.groundTruth,
    delta: privileged.delta,
    namingScheme: privileged.namingScheme,
    budgetTokens: config.contextBudget,
    maxTokensPerUnit: maxTokensPerUnit!,
  });
}

function loadElPrivilegedInputs(
  syntheticWorldDir: string,
  task: ElStaticExposureTaskDescriptor
): { groundTruth: GroundTruth; delta: GroundTruthDelta; namingScheme: NamingScheme } {
  if (!task.groundTruthDelta) {
    throw new Error(`EL task ${task.taskId} is missing GroundTruthDelta`);
  }
  if (!task.namingScheme) {
    throw new Error(`EL task ${task.taskId} is missing namingScheme`);
  }

  const groundTruth = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8")
  ) as GroundTruth;
  const schemes = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8")
  ) as NamingScheme[];
  const namingScheme = schemes.find((candidate) => candidate.schemeId === task.namingScheme);
  if (!namingScheme) {
    throw new Error(`Naming scheme not found for EL task ${task.taskId}: ${task.namingScheme}`);
  }

  return { groundTruth, delta: task.groundTruthDelta, namingScheme };
}
