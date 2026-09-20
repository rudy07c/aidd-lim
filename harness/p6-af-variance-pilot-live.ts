import * as childProcess from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  P6_2_MODEL,
  P6_2_REASONING,
  loadDirRecursive,
  loadProbeMaterial,
  runMRepeat,
  runRSemRepeat,
  type HeldOutTask,
  type RSemProbeRepeatResult,
} from "./p6-af-baseline-live";
import {
  P6_2_PRIMARY_TASK_IDS,
  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  selectP62TaskBank,
} from "./src/p6/af-baseline";
import {
  P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR,
  P6_2_VARIANCE_PILOT_VERSION,
  canReplaceVariancePair,
  classifyVariancePair,
  sizeP62VariancePilot,
  variancePairArmOrder,
  type P62VarianceArm,
  type P62VarianceArmOutcome,
} from "./src/p6/variance-pilot";
import { P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS } from "./src/p6/af-baseline";

const RESULT_SCHEMA = "p6-2-af-variance-pilot-result-v1";

type PilotStatus = "running" | "needs-audit" | "completed-awaiting-repeat-freeze";
type AttemptStatus = "running" | "replace-infrastructure" | "needs-audit" | "accepted";

interface MEvent {
  kind: "M";
  taskId: string;
  arm: P62VarianceArm;
  result: ReturnType<typeof classifyP62MRepeat>;
  artifacts: unknown;
}

interface REvent {
  kind: "Rsem";
  arm: P62VarianceArm;
  result: RSemProbeRepeatResult;
}

type PilotEvent = MEvent | REvent;

interface PairAttempt {
  pairId: number;
  attempt: number;
  armOrder: readonly [P62VarianceArm, P62VarianceArm];
  status: AttemptStatus;
  reason: string | null;
  events: PilotEvent[];
  armOutcomes: P62VarianceArmOutcome[] | null;
  startedAt: string;
  updatedAt: string;
}

interface PilotManifest {
  schemaVersion: typeof RESULT_SCHEMA;
  pilotVersion: typeof P6_2_VARIANCE_PILOT_VERSION;
  gitSha: string;
  model: typeof P6_2_MODEL;
  reasoningEffort: typeof P6_2_REASONING;
  condition: "AF-vs-AF";
  pairedAfRepeats: number;
  maxAttemptsPerPair: number;
  taskBankVersion: string;
  taskBankSha256: string;
  baselineRepositorySha256: string;
  booleanProbeBankSha256: string;
  primaryTaskIds: string[];
}

interface PilotResult {
  schemaVersion: typeof RESULT_SCHEMA;
  status: PilotStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  manifest: PilotManifest;
  attempts: PairAttempt[];
  acceptedPairs: Array<{
    pairId: number;
    attempt: number;
    mDifferenceAminusB: number;
    rsemDifferenceAminusB: number;
    armA: P62VarianceArmOutcome;
    armB: P62VarianceArmOutcome;
  }>;
  sizing: ReturnType<typeof sizeP62VariancePilot> | null;
  estimatedCostUsd: number;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashRepository(files: Record<string, string>): string {
  const h = crypto.createHash("sha256");
  for (const filePath of Object.keys(files).sort()) {
    h.update(filePath); h.update("\0"); h.update(files[filePath]); h.update("\0");
  }
  return h.digest("hex");
}

function stable(value: unknown): string {
  const sort = (x: any): any => Array.isArray(x) ? x.map(sort) : x && typeof x === "object"
    ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, sort(x[key])])) : x;
  return JSON.stringify(sort(value));
}

function writeResult(filePath: string, result: PilotResult): void {
  result.updatedAt = new Date().toISOString();
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function resultPath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", "_calibration", `p6-2-af-variance-pilot-luna__${stamp}`, "result.json");
}

function parseResume(argv: string[]): string | null {
  const i = argv.indexOf("--resume");
  if (i < 0) return null;
  if (!argv[i + 1]) throw new Error("--resume requires result.json path");
  return path.resolve(argv[i + 1]);
}

function assertTrackedClean(repoRoot: string): void {
  const dirty = childProcess.execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, encoding: "utf8" }).trim();
  if (dirty) throw new Error(`variance pilot requires clean tracked worktree:\n${dirty}`);
}

function manifestFor(args: {
  repoRoot: string;
  taskBankRaw: string;
  repository: Record<string, string>;
  probeBankSha256: string;
}): PilotManifest {
  return {
    schemaVersion: RESULT_SCHEMA,
    pilotVersion: P6_2_VARIANCE_PILOT_VERSION,
    gitSha: childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: args.repoRoot, encoding: "utf8" }).trim(),
    model: P6_2_MODEL,
    reasoningEffort: P6_2_REASONING,
    condition: "AF-vs-AF",
    pairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
    maxAttemptsPerPair: P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR,
    taskBankVersion: P6_2_TASK_BANK_VERSION,
    taskBankSha256: sha256(args.taskBankRaw),
    baselineRepositorySha256: hashRepository(args.repository),
    booleanProbeBankSha256: args.probeBankSha256,
    primaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
  };
}

function emptyResult(manifest: PilotManifest): PilotResult {
  const now = new Date().toISOString();
  return {
    schemaVersion: RESULT_SCHEMA,
    status: "running",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    manifest,
    attempts: [],
    acceptedPairs: [],
    sizing: null,
    estimatedCostUsd: 0,
  };
}

function eventKey(event: PilotEvent): string {
  return event.kind === "M" ? `M:${event.taskId}:${event.arm}` : `Rsem:${event.arm}`;
}

function getAttempt(result: PilotResult, pairId: number, attemptNo: number): PairAttempt {
  let found = result.attempts.find((item) => item.pairId === pairId && item.attempt === attemptNo);
  if (!found) {
    const now = new Date().toISOString();
    found = {
      pairId,
      attempt: attemptNo,
      armOrder: variancePairArmOrder(pairId),
      status: "running",
      reason: null,
      events: [],
      armOutcomes: null,
      startedAt: now,
      updatedAt: now,
    };
    result.attempts.push(found);
  }
  return found;
}

function recomputeCost(result: PilotResult): void {
  let total = 0;
  for (const attempt of result.attempts) {
    for (const event of attempt.events) {
      if (event.kind === "M") total += (event.result as any).estimatedCostUsd ?? 0;
      else total += event.result.estimatedCostUsd ?? 0;
    }
  }
  result.estimatedCostUsd = total;
}

function armOutcome(attempt: PairAttempt, arm: P62VarianceArm): P62VarianceArmOutcome {
  const m = attempt.events.filter((event): event is MEvent => event.kind === "M" && event.arm === arm);
  const r = attempt.events.find((event): event is REvent => event.kind === "Rsem" && event.arm === arm);
  if (m.length !== P6_2_PRIMARY_TASK_IDS.length || !r) throw new Error(`pair ${attempt.pairId} attempt ${attempt.attempt} arm ${arm} incomplete`);
  const infrastructureInvalid = m.some((event) => event.result.failureDomain === "infrastructure") || r.result.failureDomain === "infrastructure";
  const structuralFailureCount = m.filter((event) => event.result.failureDomain === "system" || event.result.failureDomain === "other").length +
    (r.result.failureDomain === "system" ? 1 : 0);
  const protocolFailureCount = m.filter((event) => event.result.failureDomain === "protocol").length +
    (r.result.failureDomain === "protocol" ? 1 : 0);
  return {
    arm,
    mPrimaryScore: m.filter((event) => event.result.passed).length / P6_2_PRIMARY_TASK_IDS.length,
    rsemSemanticAccuracy: r.result.failureDomain === "none" ? r.result.booleanAccuracy : null,
    rsemProtocolValid: r.result.failureDomain !== "protocol",
    infrastructureInvalid,
    protocolFailureCount,
    structuralFailureCount,
  };
}

function acceptPair(result: PilotResult, attempt: PairAttempt): void {
  const armA = attempt.armOutcomes!.find((item) => item.arm === "A")!;
  const armB = attempt.armOutcomes!.find((item) => item.arm === "B")!;
  if (armA.rsemSemanticAccuracy === null || armB.rsemSemanticAccuracy === null) throw new Error("accepted pair lacks Rsem semantic accuracy");
  result.acceptedPairs.push({
    pairId: attempt.pairId,
    attempt: attempt.attempt,
    mDifferenceAminusB: armA.mPrimaryScore - armB.mPrimaryScore,
    rsemDifferenceAminusB: armA.rsemSemanticAccuracy - armB.rsemSemanticAccuracy,
    armA,
    armB,
  });
}

async function executeAttempt(args: {
  attempt: PairAttempt;
  result: PilotResult;
  filePath: string;
  repository: Record<string, string>;
  syntheticWorldDir: string;
  taskById: Map<string, HeldOutTask>;
  probes: ReturnType<typeof loadProbeMaterial>["booleanProbes"];
}): Promise<void> {
  const { attempt, result } = args;
  const seen = new Set(attempt.events.map(eventKey));
  const persist = () => { attempt.updatedAt = new Date().toISOString(); recomputeCost(result); writeResult(args.filePath, result); };

  for (const taskId of P6_2_PRIMARY_TASK_IDS) {
    const task = args.taskById.get(taskId);
    if (!task) throw new Error(`missing primary task ${taskId}`);
    for (const arm of attempt.armOrder) {
      const key = `M:${taskId}:${arm}`;
      if (seen.has(key)) continue;
      const execution = await runMRepeat(args.repository, args.syntheticWorldDir, task, "primary", attempt.pairId);
      const classified = classifyP62MRepeat(execution.result, "primary");
      attempt.events.push({ kind: "M", taskId, arm, result: classified, artifacts: execution.artifacts });
      seen.add(key);
      persist();
      if (classified.failureDomain === "infrastructure") {
        attempt.status = "replace-infrastructure";
        attempt.reason = `M infrastructure-invalid at ${taskId}/${arm}`;
        persist();
        return;
      }
      if (classified.failureDomain === "system" || classified.failureDomain === "other") {
        attempt.status = "needs-audit";
        attempt.reason = `M structural failure ${classified.failureDomain} at ${taskId}/${arm}`;
        result.status = "needs-audit";
        persist();
        return;
      }
    }
  }

  for (const arm of attempt.armOrder) {
    const key = `Rsem:${arm}`;
    if (seen.has(key)) continue;
    const r = await runRSemRepeat(args.repository, args.probes, attempt.pairId);
    attempt.events.push({ kind: "Rsem", arm, result: r });
    seen.add(key);
    persist();
    if (r.failureDomain === "infrastructure") {
      attempt.status = "replace-infrastructure";
      attempt.reason = `Rsem infrastructure-invalid at ${arm}`;
      persist();
      return;
    }
    if (r.failureDomain === "protocol" || r.failureDomain === "system") {
      attempt.status = "needs-audit";
      attempt.reason = `Rsem ${r.failureDomain} failure at ${arm}`;
      result.status = "needs-audit";
      persist();
      return;
    }
  }

  attempt.armOutcomes = [armOutcome(attempt, "A"), armOutcome(attempt, "B")];
  const disposition = classifyVariancePair(attempt.armOutcomes);
  attempt.status = disposition === "accepted" ? "accepted" : disposition;
  attempt.reason = disposition === "accepted" ? null : disposition;
  if (attempt.status === "needs-audit") result.status = "needs-audit";
  persist();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  const resume = parseResume(argv);
  const repoRoot = path.resolve(__dirname, "..");
  assertTrackedClean(repoRoot);
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");
  const taskBankPath = path.join(syntheticWorldDir, "heldout_tasks.json");
  const taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const tasks = JSON.parse(taskBankRaw) as HeldOutTask[];
  const selection = selectP62TaskBank(tasks);
  const taskById = new Map(selection.primary.map((task) => [task.taskId, task]));
  const repository: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repository);
  const probeMaterial = loadProbeMaterial(syntheticWorldDir);
  const manifest = manifestFor({ repoRoot, taskBankRaw, repository, probeBankSha256: probeMaterial.probeBankSha256 });

  console.log("P6-2 VARIANCE PILOT MANIFEST", JSON.stringify(manifest));
  console.log("P6-2 VARIANCE PILOT POLICY", JSON.stringify({
    pairs: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
    order: "odd=AB/even=BA per matched task/probe",
    maxAttemptsPerPair: P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR,
    infrastructurePair: "discard-and-replace-same-pair-id",
    protocol: "record-separately; M scores failure, Rsem needs-audit",
  }));
  if (!live) {
    console.log("STOP: offline/dry mode; variance-pilot live API calls were not executed.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for --live variance pilot");

  const filePath = resume ?? resultPath(repoRoot);
  let result: PilotResult;
  if (resume) {
    result = JSON.parse(fs.readFileSync(filePath, "utf8")) as PilotResult;
    if (result.schemaVersion !== RESULT_SCHEMA || stable(result.manifest) !== stable(manifest)) {
      throw new Error("variance-pilot resume refused: frozen manifest changed");
    }
    if (result.status === "needs-audit") throw new Error("variance-pilot resume refused: result is needs-audit");
  } else {
    result = emptyResult(manifest);
    writeResult(filePath, result);
    console.log("RESULT", filePath);
  }

  for (let pairId = 1; pairId <= P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS; pairId++) {
    if (result.acceptedPairs.some((pair) => pair.pairId === pairId)) continue;
    let accepted = false;
    for (let attemptNo = 1; attemptNo <= P6_2_VARIANCE_MAX_ATTEMPTS_PER_PAIR; attemptNo++) {
      const prior = result.attempts.find((item) => item.pairId === pairId && item.attempt === attemptNo);
      if (prior?.status === "accepted") { if (!result.acceptedPairs.some((pair) => pair.pairId === pairId)) acceptPair(result, prior); accepted = true; break; }
      if (prior?.status === "replace-infrastructure") {
        if (!canReplaceVariancePair(attemptNo)) break;
        continue;
      }
      if (prior?.status === "needs-audit") { result.status = "needs-audit"; writeResult(filePath, result); return; }
      const attempt = getAttempt(result, pairId, attemptNo);
      await executeAttempt({
        attempt,
        result,
        filePath,
        repository,
        syntheticWorldDir,
        taskById,
        probes: probeMaterial.booleanProbes,
      });
      if (attempt.status === "accepted") { acceptPair(result, attempt); writeResult(filePath, result); accepted = true; break; }
      if (attempt.status === "needs-audit") return;
      if (attempt.status === "replace-infrastructure" && !canReplaceVariancePair(attemptNo)) break;
    }
    if (!accepted) {
      result.status = "needs-audit";
      result.completedAt = null;
      writeResult(filePath, result);
      console.log(`STOP: pair ${pairId} exhausted infrastructure replacement limit; needs-audit.`);
      return;
    }
  }

  result.acceptedPairs.sort((a, b) => a.pairId - b.pairId);
  const sizing = sizeP62VariancePilot({
    mDifferences: result.acceptedPairs.map((pair) => pair.mDifferenceAminusB),
    rsemDifferences: result.acceptedPairs.map((pair) => pair.rsemDifferenceAminusB),
  });
  result.sizing = sizing;
  if (sizing.needsAudit || sizing.frozenScientificRepeatCount === null) {
    result.status = "needs-audit";
    result.completedAt = null;
    writeResult(filePath, result);
    console.log("STOP: exact paired-TOST power remains <0.80 by n=30 for at least one measurement; needs-audit.");
    return;
  }
  result.status = "completed-awaiting-repeat-freeze";
  result.completedAt = new Date().toISOString();
  writeResult(filePath, result);
  console.log("P6-2 VARIANCE SIZING", JSON.stringify(sizing));
  console.log(`P6-2 TOTAL COST $${result.estimatedCostUsd.toFixed(6)}`);
  console.log("RESULT", filePath);
  console.log("STOP: pilot completed. Commit the suggested repeat count into the frozen baseline constant before any P6-2 baseline --live execution.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("p6-af-variance-pilot failed:", error);
    process.exit(1);
  });
}
