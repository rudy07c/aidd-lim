// harness/src/context/assembler.ts
//
// Full / 単純Limited の context 構築。（docs/harness_stage0_plan.md 2.3節）
//
// Stage 0では2条件のみ：
// - full: repository/ 配下の全ファイルをそのまま contextへ含める
// - simple-limited: ナイーブな固定ルールで一部ファイルを省略する
//                  （実装ファイルを先頭 N 文字で打ち切り、総文字数も制限する）
//                  ※ tests/・型定義ファイルは除外せず全文を含める
//                    （理由は assembleSimpleLimited のコメント参照）
//
// このLimited条件の「巧拙は問わない」（計画書2.3節）。
// Stage 1で導入する Privileged Selector / Agent-Retrieved の設計はここでは不要。
// 目的は「context条件によって挙動を変えられる構造になっているか」の確認のみ。

import { ContextCondition } from "../types";

// simple-limited での実装ファイル1ファイルあたりの最大文字数（rough: 約300 tokens相当）
// priorityFiles（tests・型定義・固定契約ファイル）はこの制限の対象外
const SIMPLE_LIMITED_MAX_CHARS_PER_FILE = 1200;
// simple-limited での最大総文字数
// priorityFiles 合計（tests≈2171 + world.ts≈456 + vok/state.ts≈46 + protocol_adapter.ts≈2365 ≈ 5038）
// を確実に収容し、残り枠（≈962）で実装ロジックファイルを部分的に含める水準に設定
const SIMPLE_LIMITED_MAX_TOTAL_CHARS = 6000;

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
 * 1. testsファイル・型定義ファイルを優先して総枠に収める（per-file cap なし: 全文を渡す）
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
 * tests・型定義・固定契約ファイルを per-file cap の対象外とする理由:
 * - テストが中途半端に切り詰められると、AIが不完全なテストを見て誤った判断を
 *   する可能性があり、「テストという安全網をきちんと見せる」という意図が損なわれる。
 * - 型定義ファイル（WorldState等）が見えないと、AIは基礎的な型情報のないまま
 *   コードを書くことになり、「意味の理解に失敗する」という研究したい現象とは
 *   別種の失敗（型エラー、型の当て推量）を引き起こす意図しない交絡になる。
 *   型定義ファイルの判定は isTypeDefinitionFile() を参照。
 * - protocol_adapter.ts（固定契約ファイル）が切り詰められると、AIはWorldProtocol
 *   の戻り値型（OperationResult<WorldState>）を一度も見ないまま独自に再実装し、
 *   TypeScriptコンパイルエラーが発生して以降の全世代のH(G)・task-specific testが
 *   起動不能になる。研究したい現象（意味理解の失敗）以前の問題でtrajectory全体が
 *   無効化されるため、この固定契約ファイルは常に全文を含める。
 *   判定は isFixedContractFile() を参照。
 */
function assembleSimpleLimited(
  repositoryFiles: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  let totalChars = 0;

  const priorityFiles: [string, string][] = []; // tests + 型定義 + 固定契約: per-file cap なし
  const implFiles: [string, string][] = [];

  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    if (isTestFile(filePath) || isTypeDefinitionFile(content) || isFixedContractFile(filePath)) {
      priorityFiles.push([filePath, content]);
    } else {
      implFiles.push([filePath, content]);
    }
  }

  // tests・型定義ファイルを優先して枠に収める（per-file cap なし: 全文を渡す）
  for (const [filePath, content] of priorityFiles) {
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
 * protocol_adapter.ts（WorldProtocol固定契約ファイル）かどうかを判定する。
 * ファイルパスの末尾で判定する（Synthetic Worldでは1ファイルのみ）。
 */
function isFixedContractFile(filePath: string): boolean {
  return filePath.replace(/\\/g, "/").endsWith("protocol_adapter.ts");
}

/**
 * ファイル内容から、型定義ファイルかどうかを判定する。
 * `export type` または `export interface` の行を含む場合に true を返す。
 * ファイル名ではなく内容で判定することで、型定義が別ファイルに移動・追加された
 * 場合にも自動的に対応する。
 */
function isTypeDefinitionFile(content: string): boolean {
  return /^export\s+(type|interface)\s/m.test(content);
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
