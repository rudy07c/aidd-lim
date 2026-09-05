// calibration/src/probe-scorer.ts
//
// agentの回答文字列から各probe形式の正誤を判定するロジック。
//
// 各probe typeの正解フォーマット:
//   - multiple_choice       : correctOptionId（operation表示名の完全一致）
//   - boolean               : correctAnswer が true/false。
//                             agentAnswer は "true"/"false"/"yes"/"no" を正規化して判定。
//   - set_selection         : correctSet（ソート済みJSON文字列）と比較。
//                             agentAnswer はJSON配列文字列 or カンマ区切り文字列を受け付ける。
//   - graph_edge_prediction : correctAnswer（entity表示名の完全一致）
//   - state_transition_prediction : correctAnswer（state表示名または"operation fails"の完全一致）

import type { GeneratedProbe } from "./probe-generator";

// ---- 正規化ユーティリティ ----

/** boolean agentAnswerの正規化: "yes"/"true"/"1" → true, "no"/"false"/"0" → false */
function normalizeBooleanAnswer(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "1" || s === "はい") return true;
  if (s === "false" || s === "no" || s === "0" || s === "いいえ") return false;
  return null; // parse error
}

/** set agentAnswerの正規化: JSON配列文字列またはカンマ区切り文字列を string[] に変換してソート */
function normalizeSetAnswer(raw: string): string[] | null {
  const s = raw.trim();
  // JSON配列として解析を試みる
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
        return [...arr].sort();
      }
    } catch {
      // fall through to comma-split
    }
  }
  // カンマ区切り文字列
  if (s.length === 0) return [];
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0).sort();
}

/** correctSet を正規化済みソート済みJSON文字列に変換 */
function normalizeCorrectSet(correctSet: string[]): string {
  return JSON.stringify([...correctSet].sort());
}

// ---- 正解文字列の正規化（GenerationLog.SemanticProbeResult.correctAnswer 用） ----

/**
 * probe の正解を文字列に正規化する。
 * - boolean → "true" / "false"
 * - set_selection → ソート済みJSON配列文字列
 * - その他 → 文字列そのまま
 */
export function normalizeCorrectAnswer(probe: GeneratedProbe): string {
  if (probe.type === "boolean") {
    return String(probe.correctAnswer ?? false);
  }
  if (probe.type === "set_selection") {
    return normalizeCorrectSet(probe.correctSet ?? []);
  }
  // multiple_choice, graph_edge_prediction, state_transition_prediction
  return String(probe.correctAnswer ?? probe.correctOptionId ?? "");
}

// ---- スコアリング ----

export interface ScoringResult {
  probeId: string;
  correct: boolean;
  agentAnswer: string;
  correctAnswer: string; // normalizeCorrectAnswer の出力
  parseError?: string;   // agentAnswerのパースに失敗した場合
}

/**
 * 1つのprobeに対するagentの回答を採点する。
 *
 * @param probe - 採点対象のprobe
 * @param agentRawAnswer - agentが返した生の回答文字列
 */
export function scoreProbe(probe: GeneratedProbe, agentRawAnswer: string): ScoringResult {
  const correctAnswer = normalizeCorrectAnswer(probe);
  const agentAnswer = agentRawAnswer.trim();

  switch (probe.type) {
    case "multiple_choice": {
      // correctOptionId（表示名）との完全一致
      const correct = agentAnswer === probe.correctOptionId;
      return { probeId: probe.probeId, correct, agentAnswer, correctAnswer };
    }

    case "boolean": {
      const parsed = normalizeBooleanAnswer(agentAnswer);
      if (parsed === null) {
        return {
          probeId: probe.probeId,
          correct: false,
          agentAnswer,
          correctAnswer,
          parseError: `boolean parse error: "${agentRawAnswer}"`,
        };
      }
      const expected = probe.correctAnswer as boolean;
      return { probeId: probe.probeId, correct: parsed === expected, agentAnswer, correctAnswer };
    }

    case "set_selection": {
      const parsed = normalizeSetAnswer(agentAnswer);
      if (parsed === null) {
        return {
          probeId: probe.probeId,
          correct: false,
          agentAnswer,
          correctAnswer,
          parseError: `set parse error: "${agentRawAnswer}"`,
        };
      }
      const agentSet = JSON.stringify(parsed);
      const correctSet = normalizeCorrectSet(probe.correctSet ?? []);
      return { probeId: probe.probeId, correct: agentSet === correctSet, agentAnswer, correctAnswer };
    }

    case "graph_edge_prediction": {
      // entity表示名の完全一致
      const expected = String(probe.correctAnswer ?? "");
      return { probeId: probe.probeId, correct: agentAnswer === expected, agentAnswer, correctAnswer };
    }

    case "state_transition_prediction": {
      // state表示名または "operation fails" の完全一致
      const expected = String(probe.correctAnswer ?? "");
      return { probeId: probe.probeId, correct: agentAnswer === expected, agentAnswer, correctAnswer };
    }

    default: {
      const _exhaustive: never = probe.type;
      return {
        probeId: probe.probeId,
        correct: false,
        agentAnswer,
        correctAnswer,
        parseError: `unknown probe type: ${_exhaustive}`,
      };
    }
  }
}

/**
 * 複数のprobeを一括採点する。
 *
 * @param probes - probeのリスト
 * @param answers - probeId → agentRawAnswer のマップ（存在しないIDは空文字で採点）
 */
export function scoreProbes(
  probes: GeneratedProbe[],
  answers: Record<string, string>
): ScoringResult[] {
  return probes.map((probe) => {
    const raw = answers[probe.probeId] ?? "";
    return scoreProbe(probe, raw);
  });
}

// ---- 集計ユーティリティ ----

export interface ScoreSummary {
  total: number;
  correct: number;
  accuracy: number;
  byType: Record<string, { total: number; correct: number; accuracy: number }>;
  parseErrors: number;
}

export function summarizeScores(results: ScoringResult[], probes: GeneratedProbe[]): ScoreSummary {
  const probeTypeMap = new Map(probes.map((p) => [p.probeId, p.type]));
  const byType: Record<string, { total: number; correct: number }> = {};

  let correct = 0;
  let parseErrors = 0;

  for (const r of results) {
    if (r.correct) correct++;
    if (r.parseError) parseErrors++;

    const type = probeTypeMap.get(r.probeId) ?? "unknown";
    if (!byType[type]) byType[type] = { total: 0, correct: 0 };
    byType[type].total++;
    if (r.correct) byType[type].correct++;
  }

  const total = results.length;

  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [
        k,
        { total: v.total, correct: v.correct, accuracy: v.total > 0 ? v.correct / v.total : 0 },
      ])
    ),
    parseErrors,
  };
}
