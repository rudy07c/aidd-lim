// calibration/src/budget-assembler.ts
//
// Stage 0.5 historical static-subset calibration.
// IMPORTANT: finite-budget selection remains char-based (1 token ~= 4 chars) so old
// experiments are reproducible. P3 adds canonical o200k_base accounting alongside that
// historical value; it does not silently redefine the old B=1K/2K/... treatment.

import * as fs from "fs";
import * as path from "path";
import {
  ArtifactFileCategory,
  classifyArtifactFile,
} from "../../harness/src/measurement/file-classification";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalFileContentTokens,
} from "../../harness/src/measurement/token-counter";

export type BudgetValue = 0 | 1000 | 2000 | 4000 | 8000 | "full";
export const ALL_BUDGETS: BudgetValue[] = [0, 1000, 2000, 4000, 8000, "full"];

export type FileCategory = ArtifactFileCategory;
export type AssemblyMode = "system1" | "system2";

export interface FileDetail {
  path: string;
  category: FileCategory;
  originalChars: number;
  includedChars: number;
  truncated: boolean;
}

export interface AssembledContext {
  budget: BudgetValue;
  files: Record<string, string>;
  /** Historical Stage 0.5 approximation; retained unchanged for old result comparability. */
  totalTokens: number;
  /** Stage 1/P3 canonical content-token accounting. */
  canonicalTokens: number;
  canonicalTokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
  fileDetails: FileDetail[];
}

/** Historical approximation used by the original Stage 0.5 budget treatment. */
export function estimateTokenCount(files: Record<string, string>): number {
  const totalChars = Object.values(files).reduce((sum, c) => sum + c.length, 0);
  return Math.ceil(totalChars / 4);
}

const CATEGORY_PRIORITY_SYSTEM2: Record<FileCategory, number> = {
  type_definition: 0,
  fixed_contract: 1,
  test: 2,
  implementation: 3,
};

const CATEGORY_PRIORITY_SYSTEM1: Record<FileCategory, number> = {
  type_definition: 0,
  fixed_contract: 1,
  test: 1,
  implementation: 1,
};

export function assembleContext(
  repositoryFiles: Record<string, string>,
  budget: BudgetValue,
  mode: AssemblyMode = "system2"
): AssembledContext {
  if (budget === 0) return finalizeContext(budget, {}, []);

  const priorityTable = mode === "system1" ? CATEGORY_PRIORITY_SYSTEM1 : CATEGORY_PRIORITY_SYSTEM2;
  const entries = Object.entries(repositoryFiles)
    .map(([filePath, content]) => ({
      filePath,
      content,
      category: classifyArtifactFile(filePath, content),
    }))
    .sort((a, b) => {
      const pDiff = priorityTable[a.category] - priorityTable[b.category];
      if (pDiff !== 0) return pDiff;
      return a.filePath.localeCompare(b.filePath);
    });

  if (budget === "full") {
    const files: Record<string, string> = {};
    const fileDetails: FileDetail[] = [];
    for (const { filePath, content, category } of entries) {
      files[filePath] = content;
      fileDetails.push({
        path: filePath,
        category,
        originalChars: content.length,
        includedChars: content.length,
        truncated: false,
      });
    }
    return finalizeContext(budget, files, fileDetails);
  }

  // Historical treatment: select/truncate by chars, not by the new canonical tokenizer.
  const budgetChars = budget * 4;
  let usedChars = 0;
  const files: Record<string, string> = {};
  const fileDetails: FileDetail[] = [];

  for (const { filePath, content, category } of entries) {
    if (usedChars >= budgetChars) {
      fileDetails.push({
        path: filePath,
        category,
        originalChars: content.length,
        includedChars: 0,
        truncated: true,
      });
      continue;
    }

    const remaining = budgetChars - usedChars;
    if (content.length <= remaining) {
      files[filePath] = content;
      usedChars += content.length;
      fileDetails.push({
        path: filePath,
        category,
        originalChars: content.length,
        includedChars: content.length,
        truncated: false,
      });
    } else {
      const truncated = content.slice(0, remaining);
      files[filePath] = truncated;
      usedChars += truncated.length;
      fileDetails.push({
        path: filePath,
        category,
        originalChars: content.length,
        includedChars: truncated.length,
        truncated: true,
      });
    }
  }

  return finalizeContext(budget, files, fileDetails);
}

function finalizeContext(
  budget: BudgetValue,
  files: Record<string, string>,
  fileDetails: FileDetail[]
): AssembledContext {
  return {
    budget,
    files,
    totalTokens: estimateTokenCount(files),
    canonicalTokens: countCanonicalFileContentTokens(files),
    canonicalTokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
    fileDetails,
  };
}

if (require.main === module) {
  const repoDir = path.join(__dirname, "../../synthetic-world/repository");
  const repositoryFiles: Record<string, string> = {};

  function loadDir(dir: string, baseDir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        loadDir(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
        repositoryFiles[relativePath] = fs.readFileSync(fullPath, "utf8");
      }
    }
  }
  loadDir(repoDir, repoDir);

  const totalFull = estimateTokenCount(repositoryFiles);
  const canonicalFull = countCanonicalFileContentTokens(repositoryFiles);
  console.log(
    `\nRepository: ${Object.keys(repositoryFiles).length} files, ` +
    `legacy Full=${totalFull}t, canonical Full=${canonicalFull}t (${CANONICAL_TOKEN_COUNT_METHOD})`
  );

  function printBudgetReport(mode: AssemblyMode) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`MODE: ${mode}`);
    console.log("=".repeat(60));
    for (const budget of ALL_BUDGETS) {
      const ctx = assembleContext(repositoryFiles, budget, mode);
      const label = budget === "full" ? "Full" : `${budget / 1000}K`;
      console.log(`\n-- B=${label} (historical budget=${budget === "full" ? "unbounded" : budget + " approx tokens"}) --`);
      console.log(`  Included files:   ${Object.keys(ctx.files).length} / ${Object.keys(repositoryFiles).length}`);
      console.log(`  Legacy approx:    ${ctx.totalTokens}`);
      console.log(`  Canonical tokens: ${ctx.canonicalTokens}`);
      for (const d of ctx.fileDetails) {
        if (d.includedChars === 0) {
          console.log(`    [EXCLUDED]  ${d.path} (${d.category}, ${d.originalChars} chars)`);
        } else if (d.truncated) {
          const pct = Math.round((d.includedChars / d.originalChars) * 100);
          console.log(`    [TRUNCATED] ${d.path} (${d.category}, ${d.includedChars}/${d.originalChars} chars = ${pct}%)`);
        } else {
          console.log(`    [FULL]      ${d.path} (${d.category}, ${d.includedChars} chars)`);
        }
      }
    }
  }

  printBudgetReport("system2");
  printBudgetReport("system1");
}
