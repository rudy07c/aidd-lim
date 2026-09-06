// calibration/src/budget-assembler.ts
//
// B ∈ {0, 1K, 2K, 4K, 8K, Full} それぞれについて、予算内でcontextを構築する。
// （docs/stage0_5_plan.md 3.1節参照）
//
// Stage 0の「tests・型定義・固定契約ファイルは常に全文含める」ルールは持ち込まない。
// 代わりに、予算が増えるにつれて単調に情報が追加されるfile inclusion orderを定義する：
//
//   優先順位:
//   1. 型定義ファイル（export type / export interface を含む）
//   2. 固定契約ファイル（protocol_adapter.ts）
//   3. テストファイル（tests/ 配下または .test.ts）
//   4. 実装ロジック本体（その他）
//
// B=0では何も渡さない（held-out taskのvisible instructionのみ）。
// B=Fullで全ファイルが全文含まれる。
//
// ファイル分類ロジックはharness/src/context/assembler.tsの同名関数と同じ判定基準を
// 採用しているが、budget-assemblerは独立したパッケージとして動作するため、直接importは
// せずに同等のロジックをローカルに持つ（importするとharness側の依存が引き込まれるため）。

import * as fs from "fs";
import * as path from "path";

// ---- 公開型 ----

export type BudgetValue = 0 | 1000 | 2000 | 4000 | 8000 | "full";
export const ALL_BUDGETS: BudgetValue[] = [0, 1000, 2000, 4000, 8000, "full"];

export type FileCategory = "type_definition" | "fixed_contract" | "test" | "implementation";

/**
 * コンテキスト構築モード。
 *
 * - "system2" (デフォルト): Stage 0由来のルール。型定義 > protocol_adapter.ts > tests > 実装の順に優先。
 *   世代を重ねる実験で回帰防止のため tests/固定契約を常に優先的に含める。
 * - "system1": 系統1（意味理解測定）専用。型定義のみ優先し、
 *   protocol_adapter.ts / tests / 実装ロジックは全て同列でアルファベット順に埋める。
 *   「答えを教えてしまう」情報源（operationTable、preconditionテスト記述）を
 *   優先させない設計。
 */
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
  /** path → content（切り詰め済みの場合は切り詰め後のcontent） */
  files: Record<string, string>;
  /** 概算トークン数（1 token ≈ 4 chars） */
  totalTokens: number;
  fileDetails: FileDetail[];
}

// ---- ファイル分類ヘルパー（harness/src/context/assembler.ts と同等の判定基準） ----

function categorize(filePath: string, content: string): FileCategory {
  // 固定契約ファイルを最優先で判定（型定義も含むため先に判定）
  if (isFixedContractFile(filePath)) return "fixed_contract";
  if (isTypeDefinitionFile(content)) return "type_definition";
  if (isTestFile(filePath)) return "test";
  return "implementation";
}

function isTestFile(filePath: string): boolean {
  const n = filePath.replace(/\\/g, "/");
  return n.includes("/tests/") || n.startsWith("tests/") || n.endsWith(".test.ts") || n.endsWith(".spec.ts");
}

function isFixedContractFile(filePath: string): boolean {
  return filePath.replace(/\\/g, "/").endsWith("protocol_adapter.ts");
}

function isTypeDefinitionFile(content: string): boolean {
  return /^export\s+(type|interface)\s/m.test(content);
}

/** 概算トークン数（1 token ≈ 4 chars） */
export function estimateTokenCount(files: Record<string, string>): number {
  const totalChars = Object.values(files).reduce((sum, c) => sum + c.length, 0);
  return Math.ceil(totalChars / 4);
}

// ---- 優先順位定義 ----

/** system2: Stage 0由来。型定義 > 固定契約 > tests > 実装の順 */
const CATEGORY_PRIORITY_SYSTEM2: Record<FileCategory, number> = {
  type_definition: 0,
  fixed_contract: 1,
  test: 2,
  implementation: 3,
};

/** system1: 型定義のみ優先（priority 0）。それ以外は全て同列（priority 1）でパス順に埋める */
const CATEGORY_PRIORITY_SYSTEM1: Record<FileCategory, number> = {
  type_definition: 0,
  fixed_contract: 1,
  test: 1,
  implementation: 1,
};

// ---- コンテキスト構築 ----

/**
 * 指定した予算でrepositoryFilesからcontextを構築する。
 *
 * @param repositoryFiles - path → content のマップ
 * @param budget - トークン予算（0 / 1K / 2K / 4K / 8K / "full"）
 * @param mode - "system1"（意味理解測定）または "system2"（デフォルト、機能的継続）
 */
export function assembleContext(
  repositoryFiles: Record<string, string>,
  budget: BudgetValue,
  mode: AssemblyMode = "system2"
): AssembledContext {
  if (budget === 0) {
    return { budget, files: {}, totalTokens: 0, fileDetails: [] };
  }

  const priorityTable = mode === "system1" ? CATEGORY_PRIORITY_SYSTEM1 : CATEGORY_PRIORITY_SYSTEM2;

  // ファイルを分類してpriority順にソート
  const entries = Object.entries(repositoryFiles)
    .map(([filePath, content]) => ({
      filePath,
      content,
      category: categorize(filePath, content),
    }))
    .sort((a, b) => {
      const pDiff = priorityTable[a.category] - priorityTable[b.category];
      if (pDiff !== 0) return pDiff;
      return a.filePath.localeCompare(b.filePath); // 同優先度内はパス順（決定的）
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
    return { budget, files, totalTokens: estimateTokenCount(files), fileDetails };
  }

  // 有限budget: chars換算で管理（1 token ≈ 4 chars）
  const budgetChars = budget * 4;
  let usedChars = 0;
  const files: Record<string, string> = {};
  const fileDetails: FileDetail[] = [];

  for (const { filePath, content, category } of entries) {
    if (usedChars >= budgetChars) {
      // 残り予算ゼロ: このファイルは含めない
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
      // 全文が予算内に収まる
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
      // 切り詰めて追加
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

  return { budget, files, totalTokens: estimateTokenCount(files), fileDetails };
}

// ---- CLI エントリポイント（6段階の詳細レポートを出力） ----

if (require.main === module) {
  const repoDir = path.join(__dirname, "../../synthetic-world/repository");

  // repository/ 配下の全ファイルを読み込む
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
  console.log(`\nRepository: ${Object.keys(repositoryFiles).length} files, Full=${totalFull} tokens (~${totalFull * 4} chars)`);

  function printBudgetReport(mode: AssemblyMode) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`MODE: ${mode}`);
    console.log("=".repeat(60));
    for (const budget of ALL_BUDGETS) {
      const ctx = assembleContext(repositoryFiles, budget, mode);
      const label = budget === "full" ? "Full" : `${budget / 1000}K`;
      console.log(`\n── B=${label} (budget=${budget === "full" ? "∞" : budget + " tokens"}) ──`);
      console.log(`  Included files: ${Object.keys(ctx.files).length} / ${Object.keys(repositoryFiles).length}`);
      console.log(`  Total tokens:   ${ctx.totalTokens}`);
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
