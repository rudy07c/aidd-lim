// harness/src/logging.ts
//
// 各世代のログを runs/<experiment_id>/<lineage_id>/generation_NNN/ へ書き出す。

import * as fs from "fs";
import * as path from "path";
import { GenerationLog } from "./types";

/**
 * 1世代分のログをディスクへ書き出す。
 * ObservableInteractionRecordはhidden evaluator outputとは別ファイルへ保存する。
 */
export function writeGenerationLog(log: GenerationLog, runsDir: string): string {
  const generationDir = path.join(
    runsDir,
    log.experiment_id,
    log.lineage_id,
    `generation_${String(log.generation).padStart(3, "0")}`
  );

  fs.mkdirSync(generationDir, { recursive: true });

  const meta = {
    experiment_id: log.experiment_id,
    lineage_id: log.lineage_id,
    generation: log.generation,
    condition: log.condition,
    model: log.model,
    model_provenance: log.model_provenance,
    task_id: log.task_id,
    context_budget: log.context_budget,
    actual_context_tokens: log.actual_context_tokens,
    observable_interaction: {
      schema_version: log.observable_interaction_record.schemaVersion,
      content_hash: log.observable_interaction_record.contentHash,
      token_count: log.observable_interaction_record.tokenCount,
      token_count_method: log.observable_interaction_record.tokenCountMethod,
      source_breakdown: log.observable_interaction_record.sourceBreakdown,
      inherited_previous_hash: log.inherited_observable_interaction_hash,
    },
    operational_full_feasibility: log.operational_full_feasibility,
    functional_task_result: log.functional_task_result,
    agent_execution_status: log.agent_execution_status,
    agent_error: log.agent_error,
    explicit_working_note: log.explicit_working_note,
    task_specific_test_result: log.task_specific_test_result
      ? {
          passed: log.task_specific_test_result.passed,
          numPassed: log.task_specific_test_result.numPassed,
          numFailed: log.task_specific_test_result.numFailed,
        }
      : null,
    latency_ms: log.latency_ms,
    token_usage: log.token_usage,
    cost: log.cost,
    protocol_contract_violated: log.protocol_contract_violated,
    semantic_probe_results: log.semantic_probe_results,
    semantic_element_trace: log.semantic_element_trace,
  };
  writeJson(generationDir, "meta.json", meta);

  writeJson(generationDir, "context_contents.json", log.context_contents);
  writeJson(generationDir, "agent_prompt.json", { prompt: log.agent_prompt });
  writeJson(generationDir, "agent_response.json", {
    response: log.agent_response,
    observable_assistant_messages: log.observable_assistant_messages,
    explicit_working_note: log.explicit_working_note,
    tool_calls: log.tool_calls,
    error: log.agent_error,
  });

  // Canonical P2 record. Hidden tests/scoring are intentionally written only after this
  // independent observable-history artifact has already been constructed by the orchestrator.
  writeJson(
    generationDir,
    "observable_interaction_record.json",
    log.observable_interaction_record
  );

  writeJson(generationDir, "visible_test_results.json", log.visible_test_results);
  writeJson(generationDir, "hidden_test_results.json", log.hidden_test_results);
  writeJson(generationDir, "task_specific_test_result.json", log.task_specific_test_result);

  fs.writeFileSync(path.join(generationDir, "git_diff.patch"), log.git_diff, "utf8");

  writeRepositorySnapshot(
    path.join(generationDir, "repository_before"),
    log.repository_before
  );
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

    if (beforeContent === afterContent) continue;

    if (beforeContent === undefined) {
      lines.push(`--- /dev/null`);
      lines.push(`+++ b/${filePath}`);
      lines.push(`@@ -0,0 +1,${afterContent.split("\n").length} @@`);
      for (const line of afterContent.split("\n")) lines.push(`+${line}`);
    } else if (afterContent === undefined) {
      lines.push(`--- a/${filePath}`);
      lines.push(`+++ /dev/null`);
      lines.push(`@@ -1,${beforeContent.split("\n").length} +0,0 @@`);
      for (const line of beforeContent.split("\n")) lines.push(`-${line}`);
    } else {
      lines.push(`--- a/${filePath}`);
      lines.push(`+++ b/${filePath}`);
      const beforeLines = beforeContent.split("\n");
      const afterLines = afterContent.split("\n");
      lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
      for (const line of beforeLines) lines.push(`-${line}`);
      for (const line of afterLines) lines.push(`+${line}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
