// harness/src/context/assembler.ts
//
// Full / 単純Limited の context 構築。（docs/harness_stage0_plan.md 2.3節）
//
// Stage 0では2条件のみ：
// - full: repository/ 配下の全ファイルをそのまま contextへ含める
// - simple-limited: ナイーブな固定ルールで一部ファイルを省略する
//                  （実装ファイルを先頭 N 文字で打ち切り、総文字数も制限する）
//                  ※ tests/ ファイルは除外しない（理由は assembleSimpleLimited のコメント参照）
//
// このLimited条件の「巧拙は問わない」（計画書2.3節）。
// Stage 1で導入する Privileged Selector / Agent-Retrieved の設計はここでは不要。
// 目的は「context条件によって挙動を変えられる構造になっているか」の確認のみ。

import { ContextCondition } from "../types";

// simple-limited での実装ファイル1ファイルあたりの最大文字数（rough: 約300 tokens相当）
// testsファイルはこの制限の対象外（常に全文を含める）
const SIMPLE_LIMITED_MAX_CHARS_PER_FILE = 1200;
// simple-limited での最大総文字数（rough: 約1000 tokens相当）
// Synthetic World の実装ファイル合計（約5900文字）に対して実際に発動する水準に設定
const SIMPLE_LIMITED_MAX_TOTAL_CHARS = 4000;

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
 * 1. testsファイルを優先して総枠に収める（per-file cap なし: 全文を渡す）
 * 2. 残り枠で実装ファイルを追加する（per-file cap あり: SIMPLE_LIMITED_MAX_CHARS_PER_FILE）
 * 3. 総文字数は SIMPLE_LIMITED_MAX_TOTAL_CHARS で打ち切る
 *
 * tests/ を除外しない理由:
 * tests/ を除外すると、後続世代のAI（fresh session）はテストという安全網を
 * 持たず、前世代で発生した回帰（既存機能の破壊）を参照できないまま世代を
 * またいで回帰が残り続ける問題が発生した。これは「有限contextが意味理解を
 * 妨げる」という研究の問いとは別の、安全網を取り除いた結果として自明に近い
 * 現象であり、条件設計として分離しておく必要がある（F3参照）。
 * testsは総文字数枠に含めることで、fullと実質的に同一になるのを防いでいる。
 *
 * testsを per-file cap の対象外とする理由:
 * テストが中途半端に切り詰められると、AIが不完全なテストを見て誤った判断を
 * する可能性があり、「テストという安全網をきちんと見せる」という意図が損なわれる。
 */
function assembleSimpleLimited(
  repositoryFiles: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let totalChars = 0;

  const testFiles: [string, string][] = [];
  const implFiles: [string, string][] = [];

  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    if (isTestFile(filePath)) {
      testFiles.push([filePath, content]);
    } else {
      implFiles.push([filePath, content]);
    }
  }

  // tests ファイルを優先して枠に収める（per-file cap なし: 全文を渡す）
  for (const [filePath, content] of testFiles) {
    if (totalChars >= SIMPLE_LIMITED_MAX_TOTAL_CHARS) break;
    const remaining = SIMPLE_LIMITED_MAX_TOTAL_CHARS - totalChars;
    const fileContent = content.slice(0, remaining);
    result[filePath] = fileContent;
    totalChars += fileContent.length;
  }

  // 残り枠で実装ファイルを追加（per-file cap あり）
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
