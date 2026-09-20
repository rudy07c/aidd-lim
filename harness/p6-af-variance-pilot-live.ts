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
  P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
  classifyP62MRepeat,
  p62VariancePilotArmOrder,
  selectP62TaskBank,
  type P62VariancePilotArm,
} from "./src/p6/af-baseline";
import { P6_2_EXACT_POWER_METHOD_VERSION } from "./src/p6/equivalence-power";
import {
  P6_2_VARIANCE_PILOT_VERSION,
  canReplaceP62VariancePair,
  classifyP62VariancePair,
  sizeP62VariancePilot,
  type P62VarianceArmOutcome,
} from "./src/p6/variance-pilot";
import { getPackageVersion } from "./src/agent-backend/openai/shared";

export const P6_2_VARIANCE_RESULT_SCHEMA = "p6-2-af-variance-pilot-result-v1";

type AttemptStatus = "running" | "accepted" | "replace-infrastructure" | "needs-audit";
type PilotStatus = "running" | "needs-audit" | "completed-awaiting-repeat-freeze";

interface MEvent {
  kind: "M";
  taskId: string;
  arm: P62VariancePilotArm;
  result: ReturnType<typeof classifyP62MRepeat> & { estimatedCostUsd?: number | null };
}
interface REvent { kind: "Rsem"; arm: P62VariancePilotArm; result: RSemProbeRepeatResult; }
type PilotEvent = MEvent | REvent;

interface PairAttempt {
  pairId: number;
  attempt: number;
  armOrder: readonly [P62VariancePilotArm, P62VariancePilotArm];
  status: AttemptStatus;
  reason: string | null;
  events: PilotEvent[];
  armOutcomes: P62VarianceArmOutcome[] | null;
  startedAt: string;
  updatedAt: string;
}

interface PilotManifest {
  schemaVersion: typeof P6_2_VARIANCE_RESULT_SCHEMA;
  pilotVersion: typeof P6_2_VARIANCE_PILOT_VERSION;
  exactPowerMethodVersion: typeof P6_2_EXACT_POWER_METHOD_VERSION;
  gitSha: string;
  model: typeof P6_2_MODEL;
  reasoningEffort: typeof P6_2_REASONING;
  condition: "AF-vs-AF";
  pairedAfRepeats: number;
  maxAttemptsPerPair: number;
  taskBankVersion: string;
  taskBankSha256: string;
  repositorySha256: string;
  booleanProbeBankSha256: string;
  primaryTaskIds: string[];
  nodeVersion: string;
  openAiSdkVersion: string;
  pairExecutionPolicy: "matched-unit-near-ABBA";
  infrastructureReplacementPolicy: "discard-whole-attempt-same-pair-id";
}

export interface P62VariancePilotResult {
  schemaVersion: typeof P6_2_VARIANCE_RESULT_SCHEMA;
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

function hash(value: string): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function hashRepository(files: Record<string, string>): string {
  const h = crypto.createHash("sha256");
  for (const file of Object.keys(files).sort()) { h.update(file); h.update("\0"); h.update(files[file]); h.update("\0"); }
  return h.digest("hex");
}
function stable(value: unknown): string {
  const sort = (x: any): any => Array.isArray(x) ? x.map(sort) : x && typeof x === "object"
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x;
  return JSON.stringify(sort(value));
}
function atomicWrite(filePath: string, result: P62VariancePilotResult): void {
  result.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}
function assertClean(repoRoot: string): void {
  const dirty = childProcess.execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, encoding: "utf8" }).trim();
  if (dirty) throw new Error(`variance pilot requires clean tracked worktree:\n${dirty}`);
}
function parseResume(argv: string[]): string | null {
  const i = argv.indexOf("--resume");
  if (i < 0) return null;
  if (!argv[i + 1]) throw new Error("--resume requires result.json path");
  return path.resolve(argv[i + 1]);
}
function newResultPath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", "_calibration", `p6-2-af-variance-pilot-luna__${stamp}`, "result.json");
}

export function buildVariancePilotManifest(args: {
  repoRoot: string; taskBankRaw: string; repository: Record<string, string>; probeBankSha256: string;
}): PilotManifest {
  const sdk = getPackageVersion("openai");
  if (!sdk) throw new Error("variance pilot requires non-null OpenAI SDK provenance");
  return {
    schemaVersion: P6_2_VARIANCE_RESULT_SCHEMA,
    pilotVersion: P6_2_VARIANCE_PILOT_VERSION,
    exactPowerMethodVersion: P6_2_EXACT_POWER_METHOD_VERSION,
    gitSha: childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: args.repoRoot, encoding: "utf8" }).trim(),
    model: P6_2_MODEL,
    reasoningEffort: P6_2_REASONING,
    condition: "AF-vs-AF",
    pairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS,
    maxAttemptsPerPair: P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
    taskBankVersion: P6_2_TASK_BANK_VERSION,
    taskBankSha256: hash(args.taskBankRaw),
    repositorySha256: hashRepository(args.repository),
    booleanProbeBankSha256: args.probeBankSha256,
    primaryTaskIds: [...P6_2_PRIMARY_TASK_IDS],
    nodeVersion: process.version,
    openAiSdkVersion: sdk,
    pairExecutionPolicy: "matched-unit-near-ABBA",
    infrastructureReplacementPolicy: "discard-whole-attempt-same-pair-id",
  };
}

function emptyResult(manifest: PilotManifest): P62VariancePilotResult {
  const now = new Date().toISOString();
  return { schemaVersion: P6_2_VARIANCE_RESULT_SCHEMA, status: "running", startedAt: now, updatedAt: now, completedAt: null, manifest, attempts: [], acceptedPairs: [], sizing: null, estimatedCostUsd: 0 };
}
function eventKey(event: PilotEvent): string { return event.kind === "M" ? `M:${event.taskId}:${event.arm}` : `R:${event.arm}`; }
function getAttempt(result: P62VariancePilotResult, pairId: number, attempt: number): PairAttempt {
  let row = result.attempts.find((x) => x.pairId === pairId && x.attempt === attempt);
  if (!row) {
    const now = new Date().toISOString();
    row = { pairId, attempt, armOrder: p62VariancePilotArmOrder(pairId), status: "running", reason: null, events: [], armOutcomes: null, startedAt: now, updatedAt: now };
    result.attempts.push(row);
  }
  return row;
}
function recomputeCost(result: P62VariancePilotResult): void {
  result.estimatedCostUsd = result.attempts.flatMap((a) => a.events).reduce((sum, event) => sum + (event.result.estimatedCostUsd ?? 0), 0);
}

export function summarizeVarianceArm(attempt: PairAttempt, arm: P62VariancePilotArm): P62VarianceArmOutcome {
  const m = attempt.events.filter((e): e is MEvent => e.kind === "M" && e.arm === arm);
  const r = attempt.events.find((e): e is REvent => e.kind === "Rsem" && e.arm === arm);
  if (m.length !== P6_2_PRIMARY_TASK_IDS.length || !r) throw new Error(`incomplete arm ${arm}`);
  return {
    arm,
    mPrimaryScore: m.filter((e) => e.result.passed).length / P6_2_PRIMARY_TASK_IDS.length,
    rsemSemanticAccuracy: r.result.protocolValid === true ? r.result.booleanAccuracy : null,
    rsemProtocolValid: r.result.protocolValid === true,
    infrastructureInvalid: m.some((e) => e.result.failureDomain === "infrastructure") || r.result.failureDomain === "infrastructure",
    structuralFailure: m.some((e) => e.result.failureDomain === "system" || e.result.failureDomain === "other") || r.result.failureDomain === "system",
    mProtocolFailures: m.filter((e) => e.result.failureDomain === "protocol").length,
    rsemProtocolFailure: r.result.failureDomain === "protocol",
  };
}

function acceptPair(result: P62VariancePilotResult, attempt: PairAttempt): void {
  const a = attempt.armOutcomes!.find((x) => x.arm === "A")!;
  const b = attempt.armOutcomes!.find((x) => x.arm === "B")!;
  if (a.rsemSemanticAccuracy === null || b.rsemSemanticAccuracy === null) throw new Error("accepted pair lacks protocol-valid Rsem outcome");
  result.acceptedPairs.push({ pairId: attempt.pairId, attempt: attempt.attempt, mDifferenceAminusB: a.mPrimaryScore - b.mPrimaryScore, rsemDifferenceAminusB: a.rsemSemanticAccuracy - b.rsemSemanticAccuracy, armA: a, armB: b });
}

async function executeAttempt(args: {
  attempt: PairAttempt; result: P62VariancePilotResult; filePath: string; repository: Record<string, string>;
  syntheticWorldDir: string; taskById: Map<string, HeldOutTask>; probes: ReturnType<typeof loadProbeMaterial>["booleanProbes"];
}): Promise<void> {
  const seen = new Set(args.attempt.events.map(eventKey));
  const persist = () => { args.attempt.updatedAt = new Date().toISOString(); recomputeCost(args.result); atomicWrite(args.filePath, args.result); };
  // Matched unit calls are adjacent. Odd pair=AB; even pair=BA.
  for (const taskId of P6_2_PRIMARY_TASK_IDS) {
    const task = args.taskById.get(taskId);
    if (!task) throw new Error(`missing task ${taskId}`);
    for (const arm of args.attempt.armOrder) {
      const key = `M:${taskId}:${arm}`;
      if (seen.has(key)) continue;
      const execution = await runMRepeat(args.repository, args.syntheticWorldDir, task, "primary", args.attempt.pairId);
      const classified = classifyP62MRepeat(execution.result, "primary") as MEvent["result"];
      args.attempt.events.push({ kind: "M", taskId, arm, result: classified }); seen.add(key); persist();
      if (classified.failureDomain === "infrastructure") { args.attempt.status = "replace-infrastructure"; args.attempt.reason = `M infrastructure:${taskId}:${arm}`; persist(); return; }
      if (classified.failureDomain === "system" || classified.failureDomain === "other") { args.attempt.status = "needs-audit"; args.attempt.reason = `M ${classified.failureDomain}:${taskId}:${arm}`; args.result.status = "needs-audit"; persist(); return; }
    }
  }
  for (const arm of args.attempt.armOrder) {
    const key = `R:${arm}`;
    if (seen.has(key)) continue;
    const r = await runRSemRepeat(args.repository, args.probes, args.attempt.pairId);
    args.attempt.events.push({ kind: "Rsem", arm, result: r }); seen.add(key); persist();
    if (r.failureDomain === "infrastructure") { args.attempt.status = "replace-infrastructure"; args.attempt.reason = `Rsem infrastructure:${arm}`; persist(); return; }
    if (r.failureDomain === "protocol" || r.failureDomain === "system") { args.attempt.status = "needs-audit"; args.attempt.reason = `Rsem ${r.failureDomain}:${arm}`; args.result.status = "needs-audit"; persist(); return; }
  }
  args.attempt.armOutcomes = [summarizeVarianceArm(args.attempt, "A"), summarizeVarianceArm(args.attempt, "B")];
  args.attempt.status = classifyP62VariancePair(args.attempt.armOutcomes);
  args.attempt.reason = args.attempt.status === "accepted" ? null : args.attempt.status;
  if (args.attempt.status === "needs-audit") args.result.status = "needs-audit";
  persist();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  const resume = parseResume(argv);
  const repoRoot = path.resolve(__dirname, "..");
  assertClean(repoRoot);
  const sw = path.join(repoRoot, "synthetic-world");
  const repositoryDir = path.join(sw, "repository");
  const taskBankPath = path.join(sw, "heldout_tasks.json");
  const taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const tasks = JSON.parse(taskBankRaw) as HeldOutTask[];
  const selection = selectP62TaskBank(tasks);
  const taskById = new Map(selection.primary.map((task) => [task.taskId, task]));
  const repository: Record<string, string> = {}; loadDirRecursive(repositoryDir, repositoryDir, repository);
  const probes = loadProbeMaterial(sw);
  const manifest = buildVariancePilotManifest({ repoRoot, taskBankRaw, repository, probeBankSha256: probes.probeBankSha256 });
  console.log("P6-2 VARIANCE MANIFEST", JSON.stringify(manifest));
  if (!live) { console.log("STOP: dry/offline mode; live API calls: 0"); return; }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for variance pilot --live");

  const filePath = resume ?? newResultPath(repoRoot);
  let result: P62VariancePilotResult;
  if (resume) {
    result = JSON.parse(fs.readFileSync(filePath, "utf8")) as P62VariancePilotResult;
    if (result.schemaVersion !== P6_2_VARIANCE_RESULT_SCHEMA || stable(result.manifest) !== stable(manifest)) throw new Error("variance pilot resume refused: frozen manifest changed");
    if (result.status === "needs-audit") throw new Error("variance pilot resume refused: needs-audit must be resolved before continuation");
  } else { result = emptyResult(manifest); atomicWrite(filePath, result); console.log("RESULT", filePath); }

  for (let pairId = 1; pairId <= P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS; pairId += 1) {
    if (result.acceptedPairs.some((p) => p.pairId === pairId)) continue;
    let accepted = false;
    for (let attemptNo = 1; attemptNo <= P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR; attemptNo += 1) {
      const existing = result.attempts.find((x) => x.pairId === pairId && x.attempt === attemptNo);
      if (existing?.status === "accepted") { if (!result.acceptedPairs.some((p) => p.pairId === pairId)) acceptPair(result, existing); accepted = true; break; }
      if (existing?.status === "replace-infrastructure") { if (!canReplaceP62VariancePair(attemptNo)) break; continue; }
      if (existing?.status === "needs-audit") { result.status = "needs-audit"; atomicWrite(filePath, result); return; }
      const attempt = getAttempt(result, pairId, attemptNo);
      await executeAttempt({ attempt, result, filePath, repository, syntheticWorldDir: sw, taskById, probes: probes.booleanProbes });
      if (attempt.status === "accepted") { acceptPair(result, attempt); atomicWrite(filePath, result); accepted = true; break; }
      if (attempt.status === "needs-audit") return;
      if (attempt.status === "replace-infrastructure" && !canReplaceP62VariancePair(attemptNo)) break;
    }
    if (!accepted) { result.status = "needs-audit"; atomicWrite(filePath, result); console.log(`STOP: pair ${pairId} exhausted ${P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR} attempts`); return; }
  }

  result.acceptedPairs.sort((a, b) => a.pairId - b.pairId);
  result.sizing = sizeP62VariancePilot({ mDifferences: result.acceptedPairs.map((p) => p.mDifferenceAminusB), rsemDifferences: result.acceptedPairs.map((p) => p.rsemDifferenceAminusB) });
  if (result.sizing.needsAudit || result.sizing.frozenScientificRepeatCount === null) { result.status = "needs-audit"; atomicWrite(filePath, result); console.log("STOP: exact power <0.80 by n=30; needs-audit"); return; }
  result.status = "completed-awaiting-repeat-freeze"; result.completedAt = new Date().toISOString(); atomicWrite(filePath, result);
  console.log("P6-2 VARIANCE SIZING", JSON.stringify(result.sizing));
  console.log(`P6-2 TOTAL COST $${result.estimatedCostUsd.toFixed(6)}`);
  console.log("RESULT", filePath);
  console.log("STOP: commit the suggested repeat count before P6-2 baseline --live execution.");
}

if (require.main === module) main().catch((error) => { console.error("p6-af-variance-pilot failed:", error); process.exit(1); });
