import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const SCHEMA_VERSION = "p6-2-m-variance-independence-audit-v1";

interface Args {
  historical: string;
  fresh: string;
  out: string;
}

interface AnyResult {
  startedAt: string;
  completedAt: string | null;
  manifest: {
    gitSha: string;
    primaryTaskIds: string[];
    taskSelectionVersion?: string;
  };
  attempts: Array<{
    pairId: number;
    attempt: number;
    armOrder: readonly ["A", "B"] | readonly ["B", "A"];
    startedAt?: string;
    updatedAt?: string;
    events: Array<any>;
  }>;
  acceptedPairs: Array<{
    pairId: number;
    attempt: number;
  }>;
}

function parseArgs(argv: string[]): Args {
  const value = (name: string): string => {
    const i = argv.indexOf(name);
    if (i < 0 || !argv[i + 1]) throw new Error(`${name} is required`);
    return path.resolve(argv[i + 1]);
  };
  return {
    historical: value("--historical"),
    fresh: value("--fresh"),
    out: value("--out"),
  };
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_");
}

function artifactDir(resultPath: string, pairId: number, attempt: number, arm: "A" | "B", taskId: string): string {
  return path.join(path.dirname(resultPath), `pair-${pairId}`, `attempt-${attempt}`, arm, safe(taskId));
}

function acceptedAttempt(result: AnyResult, pairId: number): number {
  const pair = result.acceptedPairs.find((row) => row.pairId === pairId);
  if (!pair) throw new Error(`accepted pair ${pairId} missing`);
  return pair.attempt;
}

function attemptRow(result: AnyResult, pairId: number, attempt: number): AnyResult["attempts"][number] {
  const row = result.attempts.find((candidate) => candidate.pairId === pairId && candidate.attempt === attempt);
  if (!row) throw new Error(`attempt ${pairId}/${attempt} missing`);
  return row;
}

function eventFor(result: AnyResult, pairId: number, attempt: number, taskId: string, arm: "A" | "B"): any {
  const row = attemptRow(result, pairId, attempt);
  const event = row.events.find((candidate) => candidate.kind === "M" && candidate.taskId === taskId && candidate.arm === arm);
  if (!event) throw new Error(`M event missing: pair=${pairId} attempt=${attempt} task=${taskId} arm=${arm}`);
  return event;
}

function readJournalRecord(resultPath: string, pairId: number, attempt: number, taskId: string, arm: "A" | "B") {
  const dir = artifactDir(resultPath, pairId, attempt, arm, taskId);
  const rawPath = path.join(dir, "agent_response.txt");
  const provenancePath = path.join(dir, "model_provenance.json");
  const metaPath = path.join(dir, "repeat_meta.json");
  const required = [rawPath, provenancePath, metaPath];
  const missing = required.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    return {
      missing,
      dir,
      rawResponse: null as string | null,
      rawResponseSha256: null as string | null,
      responseId: null as string | null,
      provenance: null as any,
      journalTimestamp: null as string | null,
      journalTimestampSource: "filesystem-mtime" as const,
      fileMtimes: null as any,
    };
  }

  const rawResponse = fs.readFileSync(rawPath, "utf8");
  const provenance = readJson(provenancePath);
  const rawMtime = fs.statSync(rawPath).mtime;
  const provenanceMtime = fs.statSync(provenancePath).mtime;
  const metaMtime = fs.statSync(metaPath).mtime;
  const journalTimestamp = new Date(Math.max(rawMtime.getTime(), provenanceMtime.getTime(), metaMtime.getTime())).toISOString();
  return {
    missing: [] as string[],
    dir,
    rawResponse,
    rawResponseSha256: sha256(rawResponse),
    responseId: typeof provenance?.responseId === "string" ? provenance.responseId : null,
    provenance,
    journalTimestamp,
    journalTimestampSource: "filesystem-mtime" as const,
    fileMtimes: {
      agentResponse: rawMtime.toISOString(),
      modelProvenance: provenanceMtime.toISOString(),
      repeatMeta: metaMtime.toISOString(),
    },
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const historicalRaw = fs.readFileSync(args.historical);
  const freshRaw = fs.readFileSync(args.fresh);
  const historical = JSON.parse(historicalRaw.toString("utf8")) as AnyResult;
  const fresh = JSON.parse(freshRaw.toString("utf8")) as AnyResult;

  if (!Array.isArray(fresh.manifest.primaryTaskIds) || fresh.manifest.primaryTaskIds.length !== 11) {
    throw new Error(`fresh primary task bank must contain 11 tasks; got ${fresh.manifest.primaryTaskIds?.length}`);
  }
  for (const taskId of fresh.manifest.primaryTaskIds) {
    if (!historical.manifest.primaryTaskIds.includes(taskId)) {
      throw new Error(`fresh task ${taskId} is absent from historical primary task bank`);
    }
  }

  const records: any[] = [];
  for (const freshPair of [...fresh.acceptedPairs].sort((a, b) => a.pairId - b.pairId)) {
    const pairId = freshPair.pairId;
    const freshAttempt = acceptedAttempt(fresh, pairId);
    const historicalAttempt = acceptedAttempt(historical, pairId);
    const freshAttemptRow = attemptRow(fresh, pairId, freshAttempt);
    const historicalAttemptRow = attemptRow(historical, pairId, historicalAttempt);

    for (const taskId of fresh.manifest.primaryTaskIds) {
      for (const arm of ["A", "B"] as const) {
        const freshJournal = readJournalRecord(args.fresh, pairId, freshAttempt, taskId, arm);
        const historicalJournal = readJournalRecord(args.historical, pairId, historicalAttempt, taskId, arm);
        const freshEvent = eventFor(fresh, pairId, freshAttempt, taskId, arm);
        const historicalEvent = eventFor(historical, pairId, historicalAttempt, taskId, arm);

        records.push({
          key: `${pairId}:${taskId}:${arm}`,
          pairId,
          taskId,
          arm,
          freshAttempt,
          historicalAttempt,
          freshArmOrder: freshAttemptRow.armOrder,
          historicalArmOrder: historicalAttemptRow.armOrder,
          freshAttemptStartedAt: freshAttemptRow.startedAt ?? null,
          freshAttemptUpdatedAt: freshAttemptRow.updatedAt ?? null,
          historicalAttemptStartedAt: historicalAttemptRow.startedAt ?? null,
          historicalAttemptUpdatedAt: historicalAttemptRow.updatedAt ?? null,
          freshResponseId: freshJournal.responseId,
          historicalResponseId: historicalJournal.responseId,
          responseIdEqual: freshJournal.responseId !== null && freshJournal.responseId === historicalJournal.responseId,
          freshJournalTimestamp: freshJournal.journalTimestamp,
          historicalJournalTimestamp: historicalJournal.journalTimestamp,
          journalTimestampSource: "filesystem-mtime",
          freshRawResponseSha256: freshJournal.rawResponseSha256,
          historicalRawResponseSha256: historicalJournal.rawResponseSha256,
          rawResponseEqual: freshJournal.rawResponse !== null && freshJournal.rawResponse === historicalJournal.rawResponse,
          freshRawResponse: freshJournal.rawResponse,
          historicalRawResponse: historicalJournal.rawResponse,
          freshResultEventSha256: sha256(JSON.stringify(freshEvent.result)),
          historicalResultEventSha256: sha256(JSON.stringify(historicalEvent.result)),
          resultEventEqual: JSON.stringify(freshEvent.result) === JSON.stringify(historicalEvent.result),
          missingFreshArtifacts: freshJournal.missing,
          missingHistoricalArtifacts: historicalJournal.missing,
        });
      }
    }
  }

  const expectedRecordCount = fresh.acceptedPairs.length * fresh.manifest.primaryTaskIds.length * 2;
  const freshIds = records.map((row) => row.freshResponseId).filter((value): value is string => typeof value === "string");
  const historicalIds = records.map((row) => row.historicalResponseId).filter((value): value is string => typeof value === "string");
  const freshTimes = records.map((row) => row.freshJournalTimestamp).filter((value): value is string => typeof value === "string").map(Date.parse);
  const historicalTimes = records.map((row) => row.historicalJournalTimestamp).filter((value): value is string => typeof value === "string").map(Date.parse);
  const freshStartMs = Date.parse(fresh.startedAt);
  const freshEndMs = Date.parse(fresh.completedAt ?? fresh.startedAt) + 5 * 60_000;
  const freshJournalTimestampOutOfWindowCount = freshTimes.filter((value) => value < freshStartMs - 5_000 || value > freshEndMs).length;
  const historicalMaxMs = historicalTimes.length ? Math.max(...historicalTimes) : Number.NaN;
  const freshMinMs = freshTimes.length ? Math.min(...freshTimes) : Number.NaN;

  const summary = {
    expectedRecordCount,
    comparedRecordCount: records.length,
    missingFreshArtifactRecordCount: records.filter((row) => row.missingFreshArtifacts.length > 0).length,
    missingHistoricalArtifactRecordCount: records.filter((row) => row.missingHistoricalArtifacts.length > 0).length,
    missingFreshResponseIdCount: records.filter((row) => row.freshResponseId === null).length,
    missingHistoricalResponseIdCount: records.filter((row) => row.historicalResponseId === null).length,
    freshUniqueResponseIdCount: new Set(freshIds).size,
    historicalUniqueResponseIdCount: new Set(historicalIds).size,
    sameResponseIdCount: records.filter((row) => row.responseIdEqual).length,
    sameRawResponseCount: records.filter((row) => row.rawResponseEqual).length,
    sameResultEventCount: records.filter((row) => row.resultEventEqual).length,
    freshJournalTimestampOutOfWindowCount,
    freshJournalMinTimestamp: Number.isFinite(freshMinMs) ? new Date(freshMinMs).toISOString() : null,
    freshJournalMaxTimestamp: freshTimes.length ? new Date(Math.max(...freshTimes)).toISOString() : null,
    historicalJournalMaxTimestamp: Number.isFinite(historicalMaxMs) ? new Date(historicalMaxMs).toISOString() : null,
    allFreshJournalTimesAfterHistoricalMax: Number.isFinite(freshMinMs) && Number.isFinite(historicalMaxMs) ? freshMinMs > historicalMaxMs : false,
  };

  const independent =
    summary.comparedRecordCount === summary.expectedRecordCount &&
    summary.missingFreshArtifactRecordCount === 0 &&
    summary.missingHistoricalArtifactRecordCount === 0 &&
    summary.missingFreshResponseIdCount === 0 &&
    summary.missingHistoricalResponseIdCount === 0 &&
    summary.freshUniqueResponseIdCount === summary.expectedRecordCount &&
    summary.sameResponseIdCount === 0 &&
    summary.sameRawResponseCount === 0 &&
    summary.freshJournalTimestampOutOfWindowCount === 0 &&
    summary.allFreshJournalTimesAfterHistoricalMax;

  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    verdict: independent ? "independent-new-api-calls" : "independence-not-established",
    timestampEvidenceNote: "The historical M journal schema did not persist provider/API execution timestamps. journalTimestamp therefore uses filesystem mtime from agent_response.txt/model_provenance.json/repeat_meta.json and is explicitly not represented as an OpenAI API timestamp.",
    source: {
      historicalResultPath: args.historical,
      freshResultPath: args.fresh,
      historicalResultSha256: sha256(historicalRaw),
      freshResultSha256: sha256(freshRaw),
      historicalManifestGitSha: historical.manifest.gitSha,
      freshManifestGitSha: fresh.manifest.gitSha,
      historicalStartedAt: historical.startedAt,
      historicalCompletedAt: historical.completedAt,
      freshStartedAt: fresh.startedAt,
      freshCompletedAt: fresh.completedAt,
      freshTaskSelectionVersion: fresh.manifest.taskSelectionVersion ?? null,
      freshPrimaryTaskIds: fresh.manifest.primaryTaskIds,
    },
    criterion: {
      requireAllArtifactsPresent: true,
      requireAllResponseIdsPresent: true,
      requireFreshResponseIdsUnique: true,
      requireNoCorrespondingResponseIdEquality: true,
      requireNoCorrespondingRawResponseEquality: true,
      requireFreshJournalTimesWithinFreshRunWindow: true,
      requireAllFreshJournalTimesAfterHistoricalMax: true,
    },
    summary,
    records,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ schemaVersion: artifact.schemaVersion, verdict: artifact.verdict, summary: artifact.summary, out: args.out }, null, 2));
  if (!independent) process.exitCode = 2;
}

main();
