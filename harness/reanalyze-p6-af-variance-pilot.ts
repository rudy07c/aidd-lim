import * as fs from "fs";
import { P6_2_DELTA_M, P6_2_DELTA_R, P6_2_PRIMARY_TASK_IDS } from "./src/p6/af-baseline";
import { sizeP62PairedDifferences } from "./src/p6/variance-pilot";

type AnyRecord = Record<string, any>;

function main(): void {
  const resultPath = process.argv[2];
  if (!resultPath) throw new Error("usage: ts-node reanalyze-p6-af-variance-pilot.ts <historical-result.json>");
  const source = JSON.parse(fs.readFileSync(resultPath, "utf8")) as AnyRecord;
  if (!Array.isArray(source.acceptedPairs) || source.acceptedPairs.length !== 8) {
    throw new Error("historical result must contain exactly 8 acceptedPairs");
  }
  if (!source.manifest?.primaryTaskIds?.includes("T-crosscut-5")) {
    throw new Error("source result is not the historical 12-task pilot containing T-crosscut-5");
  }
  if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes("T-crosscut-5")) {
    throw new Error("current primary bank still contains T-crosscut-5");
  }

  const accepted = new Map(source.acceptedPairs.map((p: AnyRecord) => [`${p.pairId}:${p.attempt}`, p]));
  const differences: number[] = [];
  const taskAudit = new Map<string, { successes: number; semantic: number; protocol: number; system: number; infrastructure: number; other: number; semanticReasons: Map<string, number> }>();

  for (const taskId of source.manifest.primaryTaskIds as string[]) {
    taskAudit.set(taskId, { successes: 0, semantic: 0, protocol: 0, system: 0, infrastructure: 0, other: 0, semanticReasons: new Map() });
  }

  for (const attempt of source.attempts as AnyRecord[]) {
    if (!accepted.has(`${attempt.pairId}:${attempt.attempt}`)) continue;
    const armScores: Record<string, number[]> = { A: [], B: [] };
    for (const event of attempt.events as AnyRecord[]) {
      if (event.kind !== "M") continue;
      const r = event.result as AnyRecord;
      const audit = taskAudit.get(event.taskId)!;
      if (r.passed) audit.successes += 1;
      else {
        const domain = r.failureDomain ?? "other";
        if (domain in audit && domain !== "successes" && domain !== "semanticReasons") (audit as any)[domain] += 1;
        if (domain === "semantic") {
          const signature = String(r.failureReason ?? "").split("\n", 1)[0];
          audit.semanticReasons.set(signature, (audit.semanticReasons.get(signature) ?? 0) + 1);
        }
      }
      if ((P6_2_PRIMARY_TASK_IDS as readonly string[]).includes(event.taskId)) {
        if (!["none", "semantic", "protocol"].includes(r.failureDomain)) {
          throw new Error(`accepted attempt contains non-scientific M domain ${r.failureDomain} for ${event.taskId}`);
        }
        armScores[event.arm].push(r.passed ? 1 : 0);
      }
    }
    for (const arm of ["A", "B"]) {
      if (armScores[arm].length !== P6_2_PRIMARY_TASK_IDS.length) {
        throw new Error(`pair ${attempt.pairId} arm ${arm}: expected ${P6_2_PRIMARY_TASK_IDS.length} current-primary outcomes, got ${armScores[arm].length}`);
      }
    }
    const scoreA = armScores.A.reduce((a,b) => a+b, 0) / armScores.A.length;
    const scoreB = armScores.B.reduce((a,b) => a+b, 0) / armScores.B.length;
    differences.push(scoreA - scoreB);
  }

  const rsemDifferences = source.acceptedPairs.map((p: AnyRecord) => p.rsemDifferenceAminusB as number);
  const m = sizeP62PairedDifferences(differences, P6_2_DELTA_M);
  const rsem = sizeP62PairedDifferences(rsemDifferences, P6_2_DELTA_R);
  const t5 = taskAudit.get("T-crosscut-5")!;
  const normalizedTaskAudit = Object.fromEntries([...taskAudit.entries()].map(([taskId, a]) => [taskId, {
    observations: a.successes + a.semantic + a.protocol + a.system + a.infrastructure + a.other,
    successes: a.successes,
    semanticFailures: a.semantic,
    protocolFailures: a.protocol,
    systemFailures: a.system,
    infrastructureFailures: a.infrastructure,
    otherFailures: a.other,
    dominantSemanticFailure: [...a.semanticReasons.entries()].sort((x,y) => y[1]-x[1])[0] ?? null,
  }]));

  const out = {
    sourceResult: resultPath,
    sourceGitSha: source.manifest?.gitSha ?? null,
    historicalPrimaryCount: source.manifest?.primaryTaskIds?.length ?? null,
    currentPrimaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
    excludedTask: "T-crosscut-5",
    crosscut5Observed: {
      observations: t5.successes + t5.semantic + t5.protocol + t5.system + t5.infrastructure + t5.other,
      successes: t5.successes,
      semanticFailures: t5.semantic,
      protocolFailures: t5.protocol,
      dominantSemanticFailure: [...t5.semanticReasons.entries()].sort((x,y) => y[1]-x[1])[0] ?? null,
    },
    bankWideTaskAudit: normalizedTaskAudit,
    mDifferencesAminusB: differences,
    deltaM: P6_2_DELTA_M,
    deltaR: P6_2_DELTA_R,
    m,
    rsem,
    suggestedCommonRepeatCount: (m.requiredN == null || rsem.requiredN == null) ? null : Math.max(8, m.requiredN, rsem.requiredN),
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
