import * as childProcess from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  P6_2_MODEL, P6_2_REASONING, loadDirRecursive, loadProbeMaterial, runMRepeat, runRSemRepeat,
  type HeldOutTask, type MRepeatExecution, type RSemProbeRepeatResult,
} from "./p6-af-baseline-live";
import {
  P6_2_DELTA_M, P6_2_DELTA_R, P6_2_EQUIVALENCE_ALPHA, P6_2_EQUIVALENCE_TARGET_POWER,
  P6_2_MAX_SCIENTIFIC_REPEATS, P6_2_MIN_SCIENTIFIC_REPEATS, P6_2_PRIMARY_TASK_IDS,
  P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS, P6_2_TASK_BANK_VERSION, P6_2_TASK_SELECTION_VERSION, P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
  P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS, P6_2_VARIANCE_SD_UCB_CONFIDENCE,
  classifyP62MRepeat, p62VariancePilotArmOrder, selectP62TaskBank, type P62VariancePilotArm,
} from "./src/p6/af-baseline";
import { P6_2_EXACT_POWER_METHOD_VERSION } from "./src/p6/equivalence-power";
import {
  P6_2_VARIANCE_PILOT_VERSION, P6_2_VARIANCE_SIGMA_FLOOR_M, P6_2_VARIANCE_SIGMA_FLOOR_R,
  P6_2_VARIANCE_SIGMA_FLOOR_VERSION, canReplaceP62VariancePair, classifyP62VariancePair,
  sizeP62VariancePilot, type P62VarianceArmOutcome,
} from "./src/p6/variance-pilot";
import {
  OPENAI_MUTATION_SCHEMA_VERSION, OPENAI_PROMPT_HASH, OPENAI_PROMPT_VERSION, OPENAI_SCHEMA_HASH,
  getPackageVersion,
} from "./src/agent-backend/openai/shared";
import type { RepeatArtifactBundle } from "./src/p6/task-bank-live-runtime";

export const P6_2_VARIANCE_RESULT_SCHEMA = "p6-2-af-variance-pilot-result-v3-task-selection-freeze";
export const P6_2_VARIANCE_ARTIFACT_LAYOUT_VERSION = "p6-2-af-variance-artifacts-v1";
export const P6_2_VARIANCE_ADJUDICATION_VERSION = "p6-2-variance-adjudication-v1";
const REQUEST_TIMEOUT_MS = 180000, MAX_RETRIES = 2, MAX_OUTPUT_TOKENS = 7000, PROBE_MAX_OUTPUT_TOKENS = 8000;
const SERVICE_TIER = "default", PROMPT_CACHE_MODE = "implicit";

export type AttemptStatus = "running" | "accepted" | "replace-infrastructure" | "needs-audit";
export type PilotStatus = "running" | "execution-needs-audit" | "statistical-design-needs-audit" | "completed-awaiting-repeat-freeze";
export type AuditKind = "execution" | "statistical-design";

export interface MEvent { kind: "M"; taskId: string; arm: P62VariancePilotArm; result: ReturnType<typeof classifyP62MRepeat> & { estimatedCostUsd?: number | null }; }
export interface REvent { kind: "Rsem"; arm: P62VariancePilotArm; result: RSemProbeRepeatResult; }
export type PilotEvent = MEvent | REvent;
export interface PairAttempt {
  pairId: number; attempt: number; armOrder: readonly [P62VariancePilotArm, P62VariancePilotArm]; status: AttemptStatus;
  reason: string | null; events: PilotEvent[]; armOutcomes: P62VarianceArmOutcome[] | null; startedAt: string; updatedAt: string;
}
export interface VarianceAuditFlag {
  auditId: string; kind: AuditKind; pairId: number | null; attempt: number | null; measurement: "M" | "Rsem" | "sizing";
  arm: P62VariancePilotArm | null; taskId: string | null; reason: string; resolvedAt: string | null; resolution: unknown | null;
}
export interface PilotManifest {
  schemaVersion: typeof P6_2_VARIANCE_RESULT_SCHEMA; pilotVersion: typeof P6_2_VARIANCE_PILOT_VERSION;
  exactPowerMethodVersion: typeof P6_2_EXACT_POWER_METHOD_VERSION; sigmaFloorVersion: typeof P6_2_VARIANCE_SIGMA_FLOOR_VERSION;
  gitSha: string; model: typeof P6_2_MODEL; reasoningEffort: typeof P6_2_REASONING; condition: "AF-vs-AF";
  deltaM: number; deltaR: number; equivalenceAlpha: number; targetPower: number; sdUcbConfidence: number;
  sigmaFloorM: number; sigmaFloorR: number; minScientificRepeats: number; maxScientificRepeats: number;
  pairedAfRepeats: number; maxAttemptsPerPair: number; taskBankVersion: string; taskSelectionVersion: string; taskBankSha256: string; repositorySha256: string;
  primaryTaskIdsSha256: string; postPilotLowHeadroomTaskIds: string[];
  booleanProbeBankSha256: string; probeSchemaHash: string; primaryTaskIds: string[]; nodeVersion: string; openAiSdkVersion: string;
  requestTimeoutMs: number; maxRetries: number; maxOutputTokens: number; probeMaxOutputTokens: number; serviceTier: string; promptCacheMode: string;
  mutationPromptVersion: string; mutationPromptHash: string; mutationSchemaVersion: string; mutationSchemaHash: string;
  runnerSha256: string; criticalSourceFingerprint: string; criticalSourceFiles: string[];
  pairExecutionPolicy: "matched-unit-near-ABBA"; infrastructureReplacementPolicy: "discard-whole-attempt-same-pair-id";
  repeatPlanningScope: "AF-noise-reference";
}
export interface AcceptedPair {
  pairId: number; attempt: number; mDifferenceAminusB: number; rsemDifferenceAminusB: number;
  armA: P62VarianceArmOutcome; armB: P62VarianceArmOutcome;
}
export interface P62VariancePilotResult {
  schemaVersion: typeof P6_2_VARIANCE_RESULT_SCHEMA; status: PilotStatus; startedAt: string; updatedAt: string; completedAt: string | null;
  manifest: PilotManifest; attempts: PairAttempt[]; acceptedPairs: AcceptedPair[]; auditFlags: VarianceAuditFlag[];
  sizing: ReturnType<typeof sizeP62VariancePilot> | null; estimatedCostUsd: number;
}
export interface VariancePilotDependencies {
  runM: (repository: Record<string, string>, syntheticWorldDir: string, task: HeldOutTask, role: "primary", repeat: number) => Promise<MRepeatExecution>;
  runR: (repository: Record<string, string>, probes: ReturnType<typeof loadProbeMaterial>["booleanProbes"], repeat: number) => Promise<RSemProbeRepeatResult>;
}

const CRITICAL_SOURCE_FILES = [
  "harness/p6-af-variance-pilot-live.ts", "harness/p6-af-baseline-live.ts", "harness/src/p6/variance-pilot.ts",
  "harness/src/p6/af-baseline.ts",
  "harness/src/p6/equivalence-power.ts", "harness/src/p6/failure-classification.ts", "harness/src/p6/task-bank-live-runtime.ts",
  "harness/src/agent-backend/openai/shared.ts", "calibration/src/stage1-probes.ts", "calibration/src/probe-scorer.ts",
] as const;
function hash(value: string | Buffer): string { return crypto.createHash("sha256").update(value).digest("hex"); }
function hashRepository(files: Record<string, string>): string { const h = crypto.createHash("sha256"); for (const f of Object.keys(files).sort()) { h.update(f); h.update("\0"); h.update(files[f]); h.update("\0"); } return h.digest("hex"); }
function stable(value: unknown): string { const sort = (x: any): any => Array.isArray(x) ? x.map(sort) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x; return JSON.stringify(sort(value)); }
function hashCriticalSources(repoRoot: string): string { const h = crypto.createHash("sha256"); for (const p of CRITICAL_SOURCE_FILES) { h.update(p); h.update("\0"); h.update(fs.readFileSync(path.join(repoRoot, p))); h.update("\0"); } return h.digest("hex"); }
function atomicWrite(filePath: string, result: P62VariancePilotResult): void { result.updatedAt = new Date().toISOString(); fs.mkdirSync(path.dirname(filePath), { recursive: true }); const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n"); fs.renameSync(tmp, filePath); }
function safe(x: string): string { return x.replace(/[^A-Za-z0-9._-]/g, "_"); }
export function varianceMArtifactDirectory(runDir: string, pairId: number, attempt: number, arm: P62VariancePilotArm, taskId: string): string { return path.join(runDir, `pair-${pairId}`, `attempt-${attempt}`, arm, safe(taskId)); }
export function commitVarianceMArtifactsAtomic(runDir: string, event: MEvent, pairId: number, attempt: number, artifacts: RepeatArtifactBundle): void {
  const target = varianceMArtifactDirectory(runDir, pairId, attempt, event.arm, event.taskId); fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`; fs.mkdirSync(tmp, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmp, "agent_response.txt"), artifacts.rawResponse, "utf8");
    fs.writeFileSync(path.join(tmp, "modified_files.json"), JSON.stringify(artifacts.modifiedFiles, null, 2) + "\n");
    fs.writeFileSync(path.join(tmp, "model_provenance.json"), JSON.stringify(artifacts.modelProvenance, null, 2) + "\n");
    fs.writeFileSync(path.join(tmp, "test_results.json"), JSON.stringify(artifacts.testResults, null, 2) + "\n");
    fs.writeFileSync(path.join(tmp, "repeat_meta.json"), JSON.stringify({ event, pairId, attempt, agentExecutionStatus: artifacts.agentExecutionStatus, agentError: artifacts.agentError, runnerError: artifacts.runnerError }, null, 2) + "\n");
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(tmp, target);
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
}
const ARTIFACT_FILES = ["agent_response.txt", "modified_files.json", "model_provenance.json", "test_results.json", "repeat_meta.json"];
export function recoverVarianceMJournal(runDir: string, result: P62VariancePilotResult): number {
  let recovered = 0;
  for (const attempt of result.attempts) {
    const seen = new Set(attempt.events.map(eventKey));
    for (const taskId of P6_2_PRIMARY_TASK_IDS) for (const arm of ["A", "B"] as const) {
      const dir = varianceMArtifactDirectory(runDir, attempt.pairId, attempt.attempt, arm, taskId);
      if (!fs.existsSync(dir) || !ARTIFACT_FILES.every((f) => fs.existsSync(path.join(dir, f)))) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, "repeat_meta.json"), "utf8")); const event = parsed.event as MEvent;
      if (event?.kind === "M" && event.taskId === taskId && event.arm === arm && !seen.has(eventKey(event))) { attempt.events.push(event); seen.add(eventKey(event)); recovered += 1; }
    }
  }
  return recovered;
}
function assertClean(repoRoot: string): void { const dirty = childProcess.execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, encoding: "utf8" }).trim(); if (dirty) throw new Error(`variance pilot requires clean tracked worktree:\n${dirty}`); }
function parseResume(argv: string[]): string | null { const i = argv.indexOf("--resume"); if (i < 0) return null; if (!argv[i + 1]) throw new Error("--resume requires result.json path"); return path.resolve(argv[i + 1]); }
function newResultPath(repoRoot: string): string { const stamp = new Date().toISOString().replace(/[:.]/g, "-"); return path.join(repoRoot, "runs", "_calibration", `p6-2-af-variance-pilot-luna__${stamp}`, "result.json"); }

export function buildVariancePilotManifest(args: { repoRoot: string; taskBankRaw: string; repository: Record<string, string>; probeBankSha256: string; probeSchemaHash: string }): PilotManifest {
  const sdk = getPackageVersion("openai"); if (!sdk) throw new Error("variance pilot requires non-null OpenAI SDK provenance"); const runner = path.join(args.repoRoot, "harness/p6-af-variance-pilot-live.ts");
  return { schemaVersion: P6_2_VARIANCE_RESULT_SCHEMA, pilotVersion: P6_2_VARIANCE_PILOT_VERSION, exactPowerMethodVersion: P6_2_EXACT_POWER_METHOD_VERSION,
    sigmaFloorVersion: P6_2_VARIANCE_SIGMA_FLOOR_VERSION, gitSha: childProcess.execFileSync("git", ["rev-parse", "HEAD"], { cwd: args.repoRoot, encoding: "utf8" }).trim(),
    model: P6_2_MODEL, reasoningEffort: P6_2_REASONING, condition: "AF-vs-AF", deltaM: P6_2_DELTA_M, deltaR: P6_2_DELTA_R,
    equivalenceAlpha: P6_2_EQUIVALENCE_ALPHA, targetPower: P6_2_EQUIVALENCE_TARGET_POWER, sdUcbConfidence: P6_2_VARIANCE_SD_UCB_CONFIDENCE,
    sigmaFloorM: P6_2_VARIANCE_SIGMA_FLOOR_M, sigmaFloorR: P6_2_VARIANCE_SIGMA_FLOOR_R, minScientificRepeats: P6_2_MIN_SCIENTIFIC_REPEATS,
    maxScientificRepeats: P6_2_MAX_SCIENTIFIC_REPEATS, pairedAfRepeats: P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS, maxAttemptsPerPair: P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
    taskBankVersion: P6_2_TASK_BANK_VERSION, taskSelectionVersion: P6_2_TASK_SELECTION_VERSION, taskBankSha256: hash(args.taskBankRaw), repositorySha256: hashRepository(args.repository), booleanProbeBankSha256: args.probeBankSha256,
    probeSchemaHash: args.probeSchemaHash, primaryTaskIds: [...P6_2_PRIMARY_TASK_IDS], primaryTaskIdsSha256: hash(stable([...P6_2_PRIMARY_TASK_IDS])),
    postPilotLowHeadroomTaskIds: [...P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS], nodeVersion: process.version, openAiSdkVersion: sdk,
    requestTimeoutMs: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES, maxOutputTokens: MAX_OUTPUT_TOKENS, probeMaxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
    serviceTier: SERVICE_TIER, promptCacheMode: PROMPT_CACHE_MODE, mutationPromptVersion: OPENAI_PROMPT_VERSION, mutationPromptHash: OPENAI_PROMPT_HASH,
    mutationSchemaVersion: OPENAI_MUTATION_SCHEMA_VERSION, mutationSchemaHash: OPENAI_SCHEMA_HASH, runnerSha256: hash(fs.readFileSync(runner)),
    criticalSourceFingerprint: hashCriticalSources(args.repoRoot), criticalSourceFiles: [...CRITICAL_SOURCE_FILES], pairExecutionPolicy: "matched-unit-near-ABBA",
    infrastructureReplacementPolicy: "discard-whole-attempt-same-pair-id", repeatPlanningScope: "AF-noise-reference" };
}
export function emptyVarianceResult(manifest: PilotManifest): P62VariancePilotResult { const now = new Date().toISOString(); return { schemaVersion: P6_2_VARIANCE_RESULT_SCHEMA, status: "running", startedAt: now, updatedAt: now, completedAt: null, manifest, attempts: [], acceptedPairs: [], auditFlags: [], sizing: null, estimatedCostUsd: 0 }; }
function eventKey(e: PilotEvent): string { return e.kind === "M" ? `M:${e.taskId}:${e.arm}` : `R:${e.arm}`; }
function getAttempt(result: P62VariancePilotResult, pairId: number, attempt: number): PairAttempt { let row = result.attempts.find((x) => x.pairId === pairId && x.attempt === attempt); if (!row) { const now = new Date().toISOString(); row = { pairId, attempt, armOrder: p62VariancePilotArmOrder(pairId), status: "running", reason: null, events: [], armOutcomes: null, startedAt: now, updatedAt: now }; result.attempts.push(row); } return row; }
function recomputeCost(result: P62VariancePilotResult): void { result.estimatedCostUsd = result.attempts.flatMap((a) => a.events).reduce((s, e) => s + (e.result.estimatedCostUsd ?? 0), 0); }
function flagExecutionAudit(result: P62VariancePilotResult, attempt: PairAttempt, measurement: "M" | "Rsem", arm: P62VariancePilotArm, reason: string, taskId: string | null): void { const auditId = `${attempt.pairId}:${attempt.attempt}:${measurement}:${arm}:${taskId ?? "-"}`; if (!result.auditFlags.some((f) => f.auditId === auditId && !f.resolvedAt)) result.auditFlags.push({ auditId, kind: "execution", pairId: attempt.pairId, attempt: attempt.attempt, measurement, arm, taskId, reason, resolvedAt: null, resolution: null }); result.status = "execution-needs-audit"; }
export function summarizeVarianceArm(attempt: PairAttempt, arm: P62VariancePilotArm): P62VarianceArmOutcome {
  const m = attempt.events.filter((e): e is MEvent => e.kind === "M" && e.arm === arm); const r = attempt.events.find((e): e is REvent => e.kind === "Rsem" && e.arm === arm); if (m.length !== P6_2_PRIMARY_TASK_IDS.length || !r) throw new Error(`incomplete arm ${arm}`);
  const rInfra = r.result.failureDomain === "infrastructure", rSystem = r.result.failureDomain === "system", rProtocol = r.result.failureDomain === "protocol";
  return { arm, mPrimaryScore: m.filter((e) => e.result.passed).length / P6_2_PRIMARY_TASK_IDS.length, rsemSemanticAccuracy: r.result.protocolValid === true ? r.result.booleanAccuracy : null,
    rsemProtocolValid: r.result.protocolValid === true, rsemProtocolDiagnostic: { attempted: 1, evaluable: rInfra || rSystem ? 0 : 1, valid: r.result.protocolValid === true ? 1 : 0, failure: rProtocol ? 1 : 0 },
    infrastructureInvalid: m.some((e) => e.result.failureDomain === "infrastructure") || rInfra, structuralFailure: m.some((e) => e.result.failureDomain === "system" || e.result.failureDomain === "other") || rSystem,
    mProtocolFailures: m.filter((e) => e.result.failureDomain === "protocol").length, rsemProtocolFailure: rProtocol };
}
function acceptPair(result: P62VariancePilotResult, attempt: PairAttempt): void { if (result.acceptedPairs.some((p) => p.pairId === attempt.pairId)) return; const a = attempt.armOutcomes!.find((x) => x.arm === "A")!, b = attempt.armOutcomes!.find((x) => x.arm === "B")!; if (a.rsemSemanticAccuracy === null || b.rsemSemanticAccuracy === null) throw new Error("accepted pair lacks protocol-valid Rsem outcome"); result.acceptedPairs.push({ pairId: attempt.pairId, attempt: attempt.attempt, mDifferenceAminusB: a.mPrimaryScore - b.mPrimaryScore, rsemDifferenceAminusB: a.rsemSemanticAccuracy - b.rsemSemanticAccuracy, armA: a, armB: b }); }

export async function executeVarianceAttempt(args: { attempt: PairAttempt; result: P62VariancePilotResult; runDir: string; repository: Record<string, string>; syntheticWorldDir: string; taskById: Map<string, HeldOutTask>; probes: ReturnType<typeof loadProbeMaterial>["booleanProbes"]; deps: VariancePilotDependencies; persist: () => void }): Promise<void> {
  const seen = new Set(args.attempt.events.map(eventKey)); const persist = () => { args.attempt.updatedAt = new Date().toISOString(); recomputeCost(args.result); args.persist(); };
  for (const taskId of P6_2_PRIMARY_TASK_IDS) { const task = args.taskById.get(taskId); if (!task) throw new Error(`missing task ${taskId}`); for (const arm of args.attempt.armOrder) {
    const key = `M:${taskId}:${arm}`; if (seen.has(key)) continue; const execution = await args.deps.runM(args.repository, args.syntheticWorldDir, task, "primary", args.attempt.pairId);
    const event: MEvent = { kind: "M", taskId, arm, result: classifyP62MRepeat(execution.result, "primary") as MEvent["result"] };
    commitVarianceMArtifactsAtomic(args.runDir, event, args.attempt.pairId, args.attempt.attempt, execution.artifacts); args.attempt.events.push(event); seen.add(key); persist();
    if (event.result.failureDomain === "infrastructure") { args.attempt.status = "replace-infrastructure"; args.attempt.reason = `M infrastructure:${taskId}:${arm}`; persist(); return; }
    if (event.result.failureDomain === "system" || event.result.failureDomain === "other") { args.attempt.status = "needs-audit"; args.attempt.reason = `M ${event.result.failureDomain}:${taskId}:${arm}`; flagExecutionAudit(args.result, args.attempt, "M", arm, args.attempt.reason, taskId); persist(); return; }
  }}
  for (const arm of args.attempt.armOrder) { const key = `R:${arm}`; if (seen.has(key)) continue; const r = await args.deps.runR(args.repository, args.probes, args.attempt.pairId); args.attempt.events.push({ kind: "Rsem", arm, result: r }); seen.add(key); persist();
    if (r.failureDomain === "infrastructure") { args.attempt.status = "replace-infrastructure"; args.attempt.reason = `Rsem infrastructure:${arm}`; persist(); return; }
    if (r.failureDomain === "protocol" || r.failureDomain === "system") { args.attempt.status = "needs-audit"; args.attempt.reason = `Rsem ${r.failureDomain}:${arm}`; flagExecutionAudit(args.result, args.attempt, "Rsem", arm, args.attempt.reason, null); persist(); return; }
  }
  args.attempt.armOutcomes = [summarizeVarianceArm(args.attempt, "A"), summarizeVarianceArm(args.attempt, "B")]; args.attempt.status = classifyP62VariancePair(args.attempt.armOutcomes); args.attempt.reason = args.attempt.status === "accepted" ? null : args.attempt.status; persist();
}

export async function runVariancePilotEngine(args: { result: P62VariancePilotResult; runDir: string; repository: Record<string, string>; syntheticWorldDir: string; taskById: Map<string, HeldOutTask>; probes: ReturnType<typeof loadProbeMaterial>["booleanProbes"]; deps: VariancePilotDependencies; persist: () => void }): Promise<void> {
  recoverVarianceMJournal(args.runDir, args.result); if (args.result.status === "execution-needs-audit" && args.result.auditFlags.some((f) => f.kind === "execution" && !f.resolvedAt)) return;
  if (args.result.status === "statistical-design-needs-audit") return;
  args.result.status = "running";
  for (let pairId = 1; pairId <= P6_2_VARIANCE_PILOT_PAIRED_AF_REPEATS; pairId += 1) {
    if (args.result.acceptedPairs.some((p) => p.pairId === pairId)) continue; let accepted = false;
    for (let attemptNo = 1; attemptNo <= P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR; attemptNo += 1) {
      const existing = args.result.attempts.find((x) => x.pairId === pairId && x.attempt === attemptNo);
      if (existing?.status === "accepted") { acceptPair(args.result, existing); args.persist(); accepted = true; break; }
      if (existing?.status === "replace-infrastructure") { if (!canReplaceP62VariancePair(attemptNo)) break; continue; }
      if (existing?.status === "needs-audit") { args.result.status = "execution-needs-audit"; args.persist(); return; }
      const attempt = getAttempt(args.result, pairId, attemptNo); await executeVarianceAttempt({ ...args, attempt });
      if (attempt.status === "accepted") { acceptPair(args.result, attempt); args.persist(); accepted = true; break; }
      if (attempt.status === "needs-audit") return; if (attempt.status === "replace-infrastructure" && !canReplaceP62VariancePair(attemptNo)) break;
    }
    if (!accepted) { args.result.status = "execution-needs-audit"; const id = `${pairId}:attempts-exhausted`; args.result.auditFlags.push({ auditId: id, kind: "execution", pairId, attempt: P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR, measurement: "M", arm: null, taskId: null, reason: "infrastructure attempts exhausted", resolvedAt: null, resolution: null }); args.persist(); return; }
  }
  args.result.acceptedPairs.sort((a, b) => a.pairId - b.pairId); args.result.sizing = sizeP62VariancePilot({ mDifferences: args.result.acceptedPairs.map((p) => p.mDifferenceAminusB), rsemDifferences: args.result.acceptedPairs.map((p) => p.rsemDifferenceAminusB) });
  if (args.result.sizing.needsAudit || args.result.sizing.frozenScientificRepeatCount === null) { args.result.status = "statistical-design-needs-audit"; if (!args.result.auditFlags.some((f) => f.kind === "statistical-design")) args.result.auditFlags.push({ auditId: "sizing:n-over-30", kind: "statistical-design", pairId: null, attempt: null, measurement: "sizing", arm: null, taskId: null, reason: "exact paired-TOST target power not reached by n=30", resolvedAt: null, resolution: null }); args.persist(); return; }
  args.result.status = "completed-awaiting-repeat-freeze"; args.result.completedAt = new Date().toISOString(); args.persist();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2), live = argv.includes("--live"), resume = parseResume(argv), repoRoot = path.resolve(__dirname, ".."); assertClean(repoRoot);
  const sw = path.join(repoRoot, "synthetic-world"), repositoryDir = path.join(sw, "repository"), taskBankPath = path.join(sw, "heldout_tasks.json"), taskBankRaw = fs.readFileSync(taskBankPath, "utf8");
  const tasks = JSON.parse(taskBankRaw) as HeldOutTask[], selection = selectP62TaskBank(tasks), taskById = new Map(selection.primary.map((t) => [t.taskId, t]));
  const repository: Record<string, string> = {}; loadDirRecursive(repositoryDir, repositoryDir, repository); const probes = loadProbeMaterial(sw);
  const manifest = buildVariancePilotManifest({ repoRoot, taskBankRaw, repository, probeBankSha256: probes.probeBankSha256, probeSchemaHash: probes.probeSchemaHash }); console.log("P6-2 VARIANCE MANIFEST", JSON.stringify(manifest));
  if (!live) { console.log("STOP: dry/offline mode; live API calls: 0"); return; } if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for variance pilot --live");
  const filePath = resume ?? newResultPath(repoRoot), runDir = path.dirname(filePath); let result: P62VariancePilotResult;
  if (resume) { result = JSON.parse(fs.readFileSync(filePath, "utf8")); if (result.schemaVersion !== P6_2_VARIANCE_RESULT_SCHEMA || stable(result.manifest) !== stable(manifest)) throw new Error("variance pilot resume refused: frozen manifest changed"); }
  else { result = emptyVarianceResult(manifest); atomicWrite(filePath, result); console.log("RESULT", filePath); }
  await runVariancePilotEngine({ result, runDir, repository, syntheticWorldDir: sw, taskById, probes: probes.booleanProbes, deps: { runM: runMRepeat, runR: runRSemRepeat }, persist: () => atomicWrite(filePath, result) });
  console.log("STATUS", result.status); if (result.sizing) console.log("P6-2 VARIANCE SIZING", JSON.stringify(result.sizing)); console.log(`P6-2 TOTAL COST $${result.estimatedCostUsd.toFixed(6)}`); console.log("RESULT", filePath);
  if (result.status === "completed-awaiting-repeat-freeze") console.log("STOP: commit the suggested repeat count before P6-2 baseline --live execution.");
}
if (require.main === module) main().catch((error) => { console.error("p6-af-variance-pilot failed:", error); process.exit(1); });
