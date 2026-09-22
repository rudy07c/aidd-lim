import * as fs from "fs";
import * as path from "path";
import {
  P6_2_DELTA_M,
  P6_2_DELTA_R,
  P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS,
  P6_2_PRIMARY_TASK_IDS,
  P6_2_TASK_SELECTION_VERSION,
} from "./src/p6/af-baseline";
import { sizeP62PairedDifferences } from "./src/p6/variance-pilot";

type AnyRecord = Record<string, any>;

export const P6_2_HISTORICAL_VARIANCE_RESULT_REPO_PATH =
  "docs/findings/evidence/p6-2-variance-pilot/result.json";
export const P6_2_POSTPILOT_AUDIT_ARTIFACT_REPO_PATH =
  "docs/findings/evidence/p6-2-variance-pilot/postpilot-task-audit.json";
export const P6_2_POSTPILOT_LOW_HEADROOM_SCREEN_VERSION =
  "p6-2-postpilot-low-headroom-screen-v1";

const HISTORICAL_SOURCE_GIT_SHA = "6551d69309f84bc6646a1bbf50daa08928c423dc";
const HISTORICAL_TASK_BANK_SHA256 = "e187f54e866a653412b948efc42ebe864cd73d308ccf81fdd63e6853589b25e5";
const HISTORICAL_PRIMARY_TASK_IDS = [
  "T-local-2",
  "T-crosscut-1",
  "T-delayed-1",
  "T-local-3",
  "T-local-4",
  "T-local-5",
  "T-local-6",
  "T-local-7",
  "T-crosscut-3",
  "T-crosscut-4",
  "T-crosscut-5",
  "T-delayed-2",
] as const;

export interface PostPilotTaskAuditRow {
  taskId: string;
  observations: number;
  successes: number;
  semanticFailures: number;
  protocolFailures: number;
  systemFailures: number;
  infrastructureFailures: number;
  otherFailures: number;
  semanticEvaluable: number;
  semanticSuccessRate: number | null;
  dominantSemanticFailure: string | null;
  dominantSignatureCount: number;
  dominantSignatureShareOfSemanticFailures: number | null;
  lowHeadroomCandidate: boolean;
}

export interface HistoricalVarianceReanalysis {
  schemaVersion: "p6-2-historical-variance-reanalysis-v2-diagnostic-only";
  sourceResult: typeof P6_2_HISTORICAL_VARIANCE_RESULT_REPO_PATH;
  sourceGitSha: string;
  sourceTaskBankSha256: string;
  historicalPrimaryTaskIds: string[];
  currentTaskSelectionVersion: string;
  currentPrimaryTaskIds: string[];
  excludedPostPilotLowHeadroomTaskIds: string[];
  screenVersion: typeof P6_2_POSTPILOT_LOW_HEADROOM_SCREEN_VERSION;
  screenRule: {
    minimumAcceptedAfObservations: number;
    minimumSemanticEvaluableObservations: number;
    maximumSemanticSuccessRateExclusive: number;
    minimumSemanticFailures: number;
    minimumDominantSignatureShareOfSemanticFailures: number;
  };
  taskAudit: PostPilotTaskAuditRow[];
  candidateTaskIds: string[];
  historicalElevenTaskReanalysis: {
    purpose: "diagnostic-only-post-selection";
    freezeEligible: false;
    mDifferencesAminusB: number[];
    deltaM: number;
    deltaR: number;
    m: ReturnType<typeof sizeP62PairedDifferences>;
    rsem: ReturnType<typeof sizeP62PairedDifferences>;
    diagnosticCommonRepeatCandidate: number | null;
  };
}

function normalizeSemanticFailure(reason: unknown): string {
  const text = String(reason ?? "").split("\n", 1)[0];
  const errorIndex = text.indexOf(":Error:");
  return errorIndex >= 0 ? text.slice(0, errorIndex) : text;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function reanalyzeHistoricalVariancePilot(source: AnyRecord): HistoricalVarianceReanalysis {
  if (source.status !== "statistical-design-needs-audit") {
    throw new Error(`historical result status changed: ${source.status}`);
  }
  if (source.manifest?.gitSha !== HISTORICAL_SOURCE_GIT_SHA) {
    throw new Error(`unexpected historical source git SHA: ${source.manifest?.gitSha}`);
  }
  if (source.manifest?.taskBankSha256 !== HISTORICAL_TASK_BANK_SHA256) {
    throw new Error(`unexpected historical task-bank SHA: ${source.manifest?.taskBankSha256}`);
  }
  if (!arraysEqual(source.manifest?.primaryTaskIds ?? [], HISTORICAL_PRIMARY_TASK_IDS)) {
    throw new Error("historical primary task IDs changed");
  }
  if (!Array.isArray(source.acceptedPairs) || source.acceptedPairs.length !== 8) {
    throw new Error("historical result must contain exactly 8 acceptedPairs");
  }
  if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes("T-crosscut-5")) {
    throw new Error("current primary bank still contains T-crosscut-5");
  }
  if (!arraysEqual(P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS, ["T-crosscut-5"])) {
    throw new Error("post-pilot low-headroom set changed unexpectedly");
  }

  const accepted = new Set(source.acceptedPairs.map((p: AnyRecord) => `${p.pairId}:${p.attempt}`));
  const counts = new Map<string, {
    successes: number;
    semantic: number;
    protocol: number;
    system: number;
    infrastructure: number;
    other: number;
    semanticReasons: Map<string, number>;
  }>();
  for (const taskId of HISTORICAL_PRIMARY_TASK_IDS) {
    counts.set(taskId, {
      successes: 0,
      semantic: 0,
      protocol: 0,
      system: 0,
      infrastructure: 0,
      other: 0,
      semanticReasons: new Map(),
    });
  }

  const differences: number[] = [];
  for (const attempt of source.attempts as AnyRecord[]) {
    if (!accepted.has(`${attempt.pairId}:${attempt.attempt}`)) continue;
    const armScores: Record<"A" | "B", number[]> = { A: [], B: [] };
    for (const event of attempt.events as AnyRecord[]) {
      if (event.kind !== "M") continue;
      const audit = counts.get(event.taskId);
      if (!audit) throw new Error(`unexpected historical primary task event: ${event.taskId}`);
      const result = event.result as AnyRecord;
      if (result.passed) {
        audit.successes += 1;
      } else {
        const domain = String(result.failureDomain ?? "other") as "semantic" | "protocol" | "system" | "infrastructure" | "other";
        if (domain === "semantic") {
          audit.semantic += 1;
          const signature = normalizeSemanticFailure(result.failureReason);
          audit.semanticReasons.set(signature, (audit.semanticReasons.get(signature) ?? 0) + 1);
        } else if (domain === "protocol") audit.protocol += 1;
        else if (domain === "system") audit.system += 1;
        else if (domain === "infrastructure") audit.infrastructure += 1;
        else audit.other += 1;
      }

      if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes(event.taskId)) {
        if (!["none", "semantic", "protocol"].includes(result.failureDomain)) {
          throw new Error(`accepted attempt contains non-scientific M domain ${result.failureDomain} for ${event.taskId}`);
        }
        armScores[event.arm as "A" | "B"].push(result.passed ? 1 : 0);
      }
    }
    for (const arm of ["A", "B"] as const) {
      if (armScores[arm].length !== P6_2_PRIMARY_TASK_IDS.length) {
        throw new Error(
          `pair ${attempt.pairId} arm ${arm}: expected ${P6_2_PRIMARY_TASK_IDS.length} current-primary outcomes, got ${armScores[arm].length}`
        );
      }
    }
    const scoreA = armScores.A.reduce((a, b) => a + b, 0) / armScores.A.length;
    const scoreB = armScores.B.reduce((a, b) => a + b, 0) / armScores.B.length;
    differences.push(scoreA - scoreB);
  }

  const taskAudit: PostPilotTaskAuditRow[] = HISTORICAL_PRIMARY_TASK_IDS.map((taskId) => {
    const row = counts.get(taskId)!;
    const observations = row.successes + row.semantic + row.protocol + row.system + row.infrastructure + row.other;
    const semanticEvaluable = row.successes + row.semantic;
    const semanticSuccessRate = semanticEvaluable > 0 ? row.successes / semanticEvaluable : null;
    const dominant = [...row.semanticReasons.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const dominantSignatureShareOfSemanticFailures = row.semantic > 0 && dominant ? dominant[1] / row.semantic : null;
    const lowHeadroomCandidate =
      observations >= 12 &&
      semanticEvaluable >= 12 &&
      semanticSuccessRate !== null && semanticSuccessRate < 1 / 3 &&
      row.semantic >= 6 &&
      dominant !== null &&
      dominant[1] >= 6 &&
      dominant[1] / row.semantic >= 2 / 3;
    return {
      taskId,
      observations,
      successes: row.successes,
      semanticFailures: row.semantic,
      protocolFailures: row.protocol,
      systemFailures: row.system,
      infrastructureFailures: row.infrastructure,
      otherFailures: row.other,
      semanticEvaluable,
      semanticSuccessRate,
      dominantSemanticFailure: dominant?.[0] ?? null,
      dominantSignatureCount: dominant?.[1] ?? 0,
      dominantSignatureShareOfSemanticFailures,
      lowHeadroomCandidate,
    };
  });

  const candidateTaskIds = taskAudit.filter((row) => row.lowHeadroomCandidate).map((row) => row.taskId);
  const rsemDifferences = source.acceptedPairs.map((pair: AnyRecord) => pair.rsemDifferenceAminusB as number);
  const m = sizeP62PairedDifferences(differences, P6_2_DELTA_M);
  const rsem = sizeP62PairedDifferences(rsemDifferences, P6_2_DELTA_R);
  const common = m.requiredN == null || rsem.requiredN == null ? null : Math.max(8, m.requiredN, rsem.requiredN);

  return {
    schemaVersion: "p6-2-historical-variance-reanalysis-v2-diagnostic-only",
    sourceResult: P6_2_HISTORICAL_VARIANCE_RESULT_REPO_PATH,
    sourceGitSha: source.manifest.gitSha,
    sourceTaskBankSha256: source.manifest.taskBankSha256,
    historicalPrimaryTaskIds: [...HISTORICAL_PRIMARY_TASK_IDS],
    currentTaskSelectionVersion: P6_2_TASK_SELECTION_VERSION,
    currentPrimaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
    excludedPostPilotLowHeadroomTaskIds: [...P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS],
    screenVersion: P6_2_POSTPILOT_LOW_HEADROOM_SCREEN_VERSION,
    screenRule: {
      minimumAcceptedAfObservations: 12,
      minimumSemanticEvaluableObservations: 12,
      maximumSemanticSuccessRateExclusive: 1 / 3,
      minimumSemanticFailures: 6,
      minimumDominantSignatureShareOfSemanticFailures: 2 / 3,
    },
    taskAudit,
    candidateTaskIds,
    historicalElevenTaskReanalysis: {
      purpose: "diagnostic-only-post-selection",
      freezeEligible: false,
      mDifferencesAminusB: differences,
      deltaM: P6_2_DELTA_M,
      deltaR: P6_2_DELTA_R,
      m,
      rsem,
      diagnosticCommonRepeatCandidate: common,
    },
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const sourceArg = args.find((arg) => !arg.startsWith("--"));
  if (!sourceArg) {
    throw new Error("usage: ts-node reanalyze-p6-af-variance-pilot.ts <historical-result.json> [--output=<path>]");
  }
  const outputArg = args.find((arg) => arg.startsWith("--output="));
  const source = JSON.parse(fs.readFileSync(path.resolve(sourceArg), "utf8")) as AnyRecord;
  const out = reanalyzeHistoricalVariancePilot(source);
  const text = JSON.stringify(out, null, 2) + "\n";
  if (outputArg) {
    const outputPath = path.resolve(outputArg.slice("--output=".length));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, text, "utf8");
  }
  process.stdout.write(text);
}

if (require.main === module) main();
