// harness/src/logging.ts
//
// 各世代のログを runs/<experiment_id>/<lineage_id>/generation_NNN/ へ書き出す。
// docs/experiment_plan_v1.6.md 3.1節のスキーマに準拠。
// runs/README.md の想定するディレクトリ構造（ディレクトリ+ファイル形式）に従う。

import * as fs from "fs";
import * as path from "path";
import { GenerationLog } from "./types";

/**
 * 1世代分のログをディスクへ書き出す。
 * 以下の構造で保存する：
 *
 * runs/<experiment_id>/<lineage_id>/generation_NNN/
 *   meta.json                 experiment_id, lineage_id, generation, condition, model, task_id,
 *                             context_budget, actual_context_tokens,
 *                             functional_task_result, latency_ms, token_usage, cost,
 *                             protocol_contract_violated,
 *                             semantic_probe_results, semantic_element_trace
 *   context_contents.json     workerに渡されたファイル群
 *   agent_prompt.json         { prompt: string }
 *   agent_response.json       { response: string, tool_calls: [] }
 *   visible_test_results.json
 *   hidden_test_results.json
 *   git_diff.patch
 *   repository_before/        前世代のリポジトリファイル群
 *   repository_after/         今世代のリポジトリファイル群（エージェント適用後）
 */
export function writeGenerationLog(log: GenerationLog, runsDir: string): string {
  const generationDir = path.join(
    runsDir,
    log.experiment_id,
    log.lineage_id,
    `generation_${String(log.generation).padStart(3, "0")}`
  );

  fs.mkdirSync(generationDir, { recursive: true });

  // meta.json
  const meta = {
    experiment_id: log.experiment_id,
    lineage_id: log.lineage_id,
    generation: log.generation,
    condition: log.condition,
    model: log.model,
    task_id: log.task_id,
    context_budget: log.context_budget,
    actual_context_tokens: log.actual_context_tokens,
    functional_task_result: log.functional_task_result,
    latency_ms: log.latency_ms,
    token_usage: log.token_usage,
    cost: log.cost,
    protocol_contract_violated: log.protocol_contract_violated,
    semantic_probe_results: log.semantic_probe_results,
    semantic_element_trace: log.semantic_element_trace,
  };
  writeJson(generationDir, "meta.json", meta);

  // context_contents.json
  writeJson(generationDir, "context_contents.json", log.context_contents);

  // agent_prompt.json
  writeJson(generationDir, "agent_prompt.json", {
    prompt: log.agent_prompt,
  });

  // agent_response.json
  writeJson(generationDir, "agent_response.json", {
    response: log.agent_response,
    tool_calls: log.tool_calls,
  });

  // visible_test_results.json
  writeJson(generationDir, "visible_test_results.json", log.visible_test_results);

  // hidden_test_results.json
  writeJson(generationDir, "hidden_test_results.json", log.hidden_test_results);

  // git_diff.patch
  fs.writeFileSync(path.join(generationDir, "git_diff.patch"), log.git_diff, "utf8");

  // repository_before/
  writeRepositorySnapshot(
    path.join(generationDir, "repository_before"),
    log.repository_before
  );

  // repository_after/
  writeRepositorySnapshot(
    path.join(generationDir, "repository_after"),
    log.repository_after
  );

  return generationDir;
}

function writeJson(dir: string, filename: string, data: unknown): void {
  fs.writeFileSync(
    path.join(dir, filename),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function writeRepositorySnapshot(
  snapshotDir: string,
  files: Record<string, string>
): void {
  fs.mkdirSync(snapshotDir, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = path.join(snapshotDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf8");
  }
}

/**
 * 簡易的な git diff（unified diff形式）を生成する。
 * git コマンドは使わず、ファイルの追加・変更・削除をテキストで記録する。
 */
export function generateDiff(
  before: Record<string, string>,
  after: Record<string, string>
): string {
  const lines: string[] = [];

  const allPaths = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const filePath of [...allPaths].sort()) {
    const beforeContent = before[filePath];
    const afterContent = after[filePath];

    if (beforeContent === afterContent) {
      continue; // 変更なし
    }

    if (beforeContent === undefined) {
      lines.push(`--- /dev/null`);
      lines.push(`+++ b/${filePath}`);
      lines.push(`@@ -0,0 +1,${afterContent.split("\n").length} @@`);
      for (const line of afterContent.split("\n")) {
        lines.push(`+${line}`);
      }
    } else if (afterContent === undefined) {
      lines.push(`--- a/${filePath}`);
      lines.push(`+++ /dev/null`);
      lines.push(`@@ -1,${beforeContent.split("\n").length} +0,0 @@`);
      for (const line of beforeContent.split("\n")) {
        lines.push(`-${line}`);
      }
    } else {
      lines.push(`--- a/${filePath}`);
      lines.push(`+++ b/${filePath}`);
      // 簡易diff: 変更ファイルの全行を - / + で表示
      const beforeLines = beforeContent.split("\n");
      const afterLines = afterContent.split("\n");
      lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
      for (const line of beforeLines) {
        lines.push(`-${line}`);
      }
      for (const line of afterLines) {
        lines.push(`+${line}`);
      }
    }

    lines.push(""); // ファイル間の空行
  }

  return lines.join("\n");
}
