// harness/src/context/assembler.ts
//
// Stage 0の legacy Full / simple-limited context 構築と、Stage 1 condition dispatch。
// Stage 1のcondition固有runtimeは段階的に実装するため、未実装conditionを
// legacy挙動へ黙ってfallbackさせず fail-closed にする。

import { ContextConditionName, getContextCondition } from "../types";
import {
  isFixedContractFile,
  isTestFile,
  isTypeDefinitionFile,
} from "../measurement/file-classification";

const SIMPLE_LIMITED_MAX_CHARS_PER_FILE = 1200;
const SIMPLE_LIMITED_MAX_TOTAL_CHARS = 6000;

export function assembleContext(
  repositoryFiles: Record<string, string>,
  conditionName: ContextConditionName
): Record<string, string> {
  const condition = getContextCondition(conditionName);

  switch (condition.name) {
    case "full":
      return assembleFull(repositoryFiles);
    case "simple-limited":
      return assembleSimpleLimited(repositoryFiles);
    case "AF":
    case "MOI":
      return assembleFull(repositoryFiles);
    case "EL":
      throw stage1RuntimeNotImplemented("EL", "static exposure selector / B_expose runtime");
    case "PR":
      throw stage1RuntimeNotImplemented("PR", "P4/P5 WorkingSetManager + privileged retrieval");
    case "AR":
      throw stage1RuntimeNotImplemented("AR", "P4/P5 WorkingSetManager + agent retrieval");
  }
}

function stage1RuntimeNotImplemented(condition: string, dependency: string): Error {
  return new Error(
    `Context condition ${condition} is defined but its execution semantics are not implemented yet (${dependency}). ` +
    `Refusing to fall back to a legacy context mode.`
  );
}

function assembleFull(repositoryFiles: Record<string, string>): Record<string, string> {
  return { ...repositoryFiles };
}

/**
 * Stage 0 単純Limited条件。P3 refactor後もhistorical treatmentは変更しない。
 * tests・型定義・固定契約を優先し、それ以外はper-file capを適用する。
 */
function assembleSimpleLimited(
  repositoryFiles: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let totalChars = 0;

  const priorityFiles: [string, string][] = [];
  const implFiles: [string, string][] = [];

  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    if (isTestFile(filePath) || isTypeDefinitionFile(content) || isFixedContractFile(filePath)) {
      priorityFiles.push([filePath, content]);
    } else {
      implFiles.push([filePath, content]);
    }
  }

  for (const [filePath, content] of priorityFiles) {
    if (totalChars >= SIMPLE_LIMITED_MAX_TOTAL_CHARS) break;
    const remaining = SIMPLE_LIMITED_MAX_TOTAL_CHARS - totalChars;
    const fileContent = content.slice(0, remaining);
    result[filePath] = fileContent;
    totalChars += fileContent.length;
  }

  for (const [filePath, content] of implFiles) {
    if (totalChars >= SIMPLE_LIMITED_MAX_TOTAL_CHARS) break;
    const truncated = content.slice(0, SIMPLE_LIMITED_MAX_CHARS_PER_FILE);
    const remaining = SIMPLE_LIMITED_MAX_TOTAL_CHARS - totalChars;
    const fileContent = truncated.slice(0, remaining);
    result[filePath] = fileContent;
    totalChars += fileContent.length;
  }

  return result;
}

/** Stage 0 historical approximation; Stage 1 canonical accounting lives in measurement/token-counter.ts. */
export function estimateTokenCount(contextFiles: Record<string, string>): number {
  const totalChars = Object.values(contextFiles).reduce(
    (sum, content) => sum + content.length,
    0
  );
  return Math.ceil(totalChars / 4);
}
