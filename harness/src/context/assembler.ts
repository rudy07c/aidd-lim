// harness/src/context/assembler.ts
//
// Full / 単純Limited の context 構築。（docs/harness_stage0_plan.md 2.3節）
//
// Stage 0では2条件のみ：
// - full: repository/ 配下の全ファイルをそのまま contextへ含める
// - simple-limited: ナイーブな固定ルールで一部ファイルを省略する
//                  （tests/ ディレクトリ、*.test.ts ファイルを除外し、
//                   残りは先頭 N 文字で打ち切る）
//
// このLimited条件の「巧拙は問わない」（計画書2.3節）。
// Stage 1で導入する Privileged Selector / Agent-Retrieved の設計はここでは不要。
// 目的は「context条件によって挙動を変えられる構造になっているか」の確認のみ。

import { ContextCondition } from "../types";

// simple-limited での1ファイルあたりの最大文字数（rough: 約2000 tokens相当）
const SIMPLE_LIMITED_MAX_CHARS_PER_FILE = 8000;
// simple-limited での最大総文字数（rough: 約8000 tokens相当）
const SIMPLE_LIMITED_MAX_TOTAL_CHARS = 32000;

export function assembleContext(
  repositoryFiles: Record<string, string>,
  condition: ContextCondition
): Record<string, string> {
  switch (condition) {
    case "full":
      return assembleFull(repositoryFiles);
    case "simple-limited":
      return assembleSimpleLimited(repositoryFiles);
  }
}

/**
 * Full条件: repository配下の全ファイルをそのまま返す
 */
function assembleFull(repositoryFiles: Record<string, string>): Record<string, string> {
  return { ...repositoryFiles };
}

/**
 * 単純Limited条件:
 * 1. tests/ ディレクトリと *.test.ts ファイルを除外する
 * 2. 残ファイルを各 SIMPLE_LIMITED_MAX_CHARS_PER_FILE 文字で打ち切る
 * 3. 総文字数が SIMPLE_LIMITED_MAX_TOTAL_CHARS を超えたらそこで打ち切る
 */
function assembleSimpleLimited(
  repositoryFiles: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let totalChars = 0;

  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    // tests/ ディレクトリと *.test.ts を除外
    if (isTestFile(filePath)) {
      continue;
    }

    if (totalChars >= SIMPLE_LIMITED_MAX_TOTAL_CHARS) {
      break;
    }

    // 各ファイルを打ち切り
    const truncated = content.slice(0, SIMPLE_LIMITED_MAX_CHARS_PER_FILE);
    const remaining = SIMPLE_LIMITED_MAX_TOTAL_CHARS - totalChars;
    const fileContent = truncated.slice(0, remaining);

    result[filePath] = fileContent;
    totalChars += fileContent.length;
  }

  return result;
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("/tests/") ||
    normalized.startsWith("tests/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.ts")
  );
}

/**
 * contextFilesのトークン数を概算する（rough: 1 token ≈ 4 chars）
 */
export function estimateTokenCount(contextFiles: Record<string, string>): number {
  const totalChars = Object.values(contextFiles).reduce(
    (sum, content) => sum + content.length,
    0
  );
  return Math.ceil(totalChars / 4);
}
