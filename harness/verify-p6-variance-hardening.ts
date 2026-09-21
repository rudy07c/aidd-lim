import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  P6_2_DELTA_M, P6_2_PRIMARY_TASK_IDS, P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR,
  p62VariancePilotArmOrder,
} from "./src/p6/af-baseline";
import { exactPairedTostPowerAtZero, findMinimumExactPairedTostN, P6_2_EXACT_POWER_METHOD_VERSION } from "./src/p6/equivalence-power";
import {
  P6_2_VARIANCE_SIGMA_FLOOR_M, chiSquareQuantile, sizeP62PairedDifferences,
} from "./src/p6/variance-pilot";
import {
  emptyVarianceResult, runVariancePilotEngine, type PilotManifest,
  type P62VariancePilotResult, type VariancePilotDependencies,
} from "./p6-af-variance-pilot-live";
import { applyVariancePilotAdjudication } from "./adjudicate-p6-af-variance-pilot";
import type { HeldOutTask, MRepeatExecution, RSemProbeRepeatResult } from "./p6-af-baseline-live";

// Independent exact-power reference provenance (2026-09-21):
// These fixtures were recomputed independently from the production TS integrator
// by transcribing CRAN OwenQ::ipowen4's published x-space integrand
// (Owen O_4 / Owen 1965 equality 11) into Python/SciPy adaptive quadrature.
// The original seven fixtures matched the independent values to <=1.3e-15.
// These source-equivalent fixtures were subsequently executed against
// R 4.6.1 / PowerTOST 1.5.7 (public paired method="exact") in workflow run
// 35565684947; max fixture discrepancy was 7.17e-13. The fixture set is now
// externally validated as well as independently derived.
const REFERENCE_POWER = [
  { n: 8, ratio: 1.0, expected: 0.6350479550768998 },
  { n: 9, ratio: 1.0, expected: 0.7246881164476543 },
  { n: 10, ratio: 1.0, expected: 0.7952072667058989 },
  { n: 11, ratio: 1.0, expected: 0.8489996576730163 },
  { n: 14, ratio: 1.2, expected: 0.8081012203363216 },
  { n: 15, ratio: 1.2, expected: 0.8446748068352706 },
  { n: 8, ratio: 0.8, expected: 0.8724593815330828 },
  { n: 12, ratio: 1.05, expected: 0.8506785557630506 },
  { n: 13, ratio: 1.1, expected: 0.8501920240426855 },
  { n: 20, ratio: 1.5, expected: 0.7804925226676869 },
  { n: 30, ratio: 2.0, expected: 0.6965086141640441 },
  { n: 8, ratio: 1.5, expected: 0.17121212404861366 },
  { n: 30, ratio: 0.7, expected: 0.9999999978502166 },
] as const;

function manifest(): PilotManifest { return {
  schemaVersion: "p6-2-af-variance-pilot-result-v2-hardening", pilotVersion: "p6-2-af-variance-pilot-v2-exact-floor-audit",
  exactPowerMethodVersion: P6_2_EXACT_POWER_METHOD_VERSION, sigmaFloorVersion: "p6-2-sigma-floor-v1", gitSha: "mock", model: "gpt-5.6-luna", reasoningEffort: "high",
  condition: "AF-vs-AF", deltaM: 1/12, deltaR: 1/12, equivalenceAlpha: .05, targetPower: .8, sdUcbConfidence: .95, sigmaFloorM: 1/12, sigmaFloorR: 1/12,
  minScientificRepeats: 8, maxScientificRepeats: 30, pairedAfRepeats: 8, maxAttemptsPerPair: 3, taskBankVersion: "mock", taskBankSha256: "mock",
  repositorySha256: "mock", booleanProbeBankSha256: "mock", probeSchemaHash: "mock", primaryTaskIds: [...P6_2_PRIMARY_TASK_IDS], nodeVersion: process.version,
  openAiSdkVersion: "mock", requestTimeoutMs: 180000, maxRetries: 2, maxOutputTokens: 7000, probeMaxOutputTokens: 8000, serviceTier: "default", promptCacheMode: "implicit",
  mutationPromptVersion: "mock", mutationPromptHash: "mock", mutationSchemaVersion: "mock", mutationSchemaHash: "mock", runnerSha256: "mock", criticalSourceFingerprint: "mock",
  criticalSourceFiles: [], pairExecutionPolicy: "matched-unit-near-ABBA", infrastructureReplacementPolicy: "discard-whole-attempt-same-pair-id", repeatPlanningScope: "AF-noise-reference",
}; }
function tasks(): HeldOutTask[] { return P6_2_PRIMARY_TASK_IDS.map((taskId) => ({ taskId, visibleInstruction: taskId })); }
function mExec(taskId: string, repeat: number, mode: "ok"|"infra"|"system" = "ok"): MRepeatExecution {
  const bad = mode !== "ok"; return { result: { taskId, taskType: "local", role: "primary", repeat, passed: !bad,
    validity: mode === "infra" ? "infrastructure-invalid" : "valid", failureCategory: mode === "infra" ? "provider" : mode === "system" ? "test-failure" : null,
    failureReason: mode === "system" ? "task-specific:execution:compiler" : null, executionStatus: mode === "infra" ? "provider-error" : "ok", visible: null, hidden: null,
    taskSpecific: null, protocolContractViolated: null, modifiedPaths: [], workingNote: null, actualModel: "mock", usage: null, estimatedCostUsd: 0 },
    artifacts: { rawResponse: mode, modifiedFiles: {}, modelProvenance: { model: "mock" }, testResults: {}, agentExecutionStatus: mode, agentError: null, runnerError: null } };
}
function rExec(repeat: number): RSemProbeRepeatResult { return { repeat, designVersion: "stage1-neutral-relation-v2", executionStatus: "ok", validity: "valid", failureDomain: "none", rawFailureDomain: "none", adjudication: null,
  protocolValid: true, failureReason: null, rawResponse: "{}", modelProvenance: { provider: "openai", requestedModel: "gpt-5.6-luna", actualModel: "mock", responseId: "mock", responseStatus: "completed", reasoningEffort: "high", maxOutputTokens: 8000, requestTimeoutMs: 180000, maxRetries: 2, sdkVersion: "mock", providerErrorCode: null },
  booleanCorrect: 12, booleanTotal: 12, booleanAccuracy: 1, probeDetails: [], actualModel: "mock", usage: { input: 0, output: 0, total: 0 }, estimatedCostUsd: 0 }; }
function successfulDeps(counter?: { m: number; r: number }): VariancePilotDependencies { return { runM: async (_repo,_sw,task,_role,repeat) => { if (counter) counter.m++; return mExec(task.taskId, repeat); }, runR: async (_repo,_probes,repeat) => { if (counter) counter.r++; return rExec(repeat); } }; }
async function drive(result: P62VariancePilotResult, runDir: string, deps: VariancePilotDependencies): Promise<void> { const taskById = new Map(tasks().map((t) => [t.taskId, t])); await runVariancePilotEngine({ result, runDir, repository: {}, syntheticWorldDir: runDir, taskById, probes: [] as any, deps, persist: () => {} }); }

async function main(): Promise<void> {
  assert.equal(P6_2_EXACT_POWER_METHOD_VERSION, "paired-tost-chi-integrated-exact-v2");
  for (const fixture of REFERENCE_POWER) { const power = exactPairedTostPowerAtZero({ n: fixture.n, sigma: fixture.ratio, delta: 1, alpha: .05 }); assert(Math.abs(power - fixture.expected) < 2e-8, `${fixture.n}/${fixture.ratio}: ${power}`); }
  const search = findMinimumExactPairedTostN({ sigmaUpperBound: 1, delta: 1, targetPower: .8, alpha: .05, minN: 8, maxN: 30 }); assert.equal(search.requiredN, 11);
  assert(Math.abs(chiSquareQuantile(.05, 7) - 2.1673499093) < 1e-8);
  const zero = sizeP62PairedDifferences(Array(8).fill(0), P6_2_DELTA_M); assert.equal(zero.sampleSd, 0); assert.equal(zero.rawSigmaUpper, 0); assert.equal(zero.sigmaFloor, P6_2_VARIANCE_SIGMA_FLOOR_M); assert.equal(zero.sigmaUpper, P6_2_VARIANCE_SIGMA_FLOOR_M); assert.equal(zero.requiredN, 11);
  assert.deepEqual(p62VariancePilotArmOrder(1), ["A","B"]); assert.deepEqual(p62VariancePilotArmOrder(2), ["B","A"]); assert.equal(P6_2_VARIANCE_PILOT_MAX_ATTEMPTS_PER_PAIR, 3);

  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "p62-var-full-")); const full = emptyVarianceResult(manifest()); await drive(full, dir1, successfulDeps());
  assert.equal(full.acceptedPairs.length, 8); assert.equal(full.status, "completed-awaiting-repeat-freeze"); assert.equal(full.acceptedPairs[0].armA.rsemProtocolDiagnostic.attempted, 1); assert.equal(full.acceptedPairs[0].armA.rsemProtocolDiagnostic.valid, 1);
  assert(fs.existsSync(path.join(dir1, "pair-1", "attempt-1", "A", P6_2_PRIMARY_TASK_IDS[0], "agent_response.txt")));

  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "p62-var-infra-")); const repl = emptyVarianceResult(manifest()); let first = true;
  const replDeps = successfulDeps(); replDeps.runM = async (_r,_s,t,_role,repeat) => { if (first) { first = false; return mExec(t.taskId, repeat, "infra"); } return mExec(t.taskId, repeat); };
  await drive(repl, dir2, replDeps); assert.equal(repl.attempts.find((a) => a.pairId===1 && a.attempt===1)?.status, "replace-infrastructure"); assert.equal(repl.acceptedPairs.find((p) => p.pairId===1)?.attempt, 2);

  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "p62-var-partial-")); const partial = emptyVarianceResult(manifest()); let calls = 0;
  const crashDeps = successfulDeps(); crashDeps.runM = async (_r,_s,t,_role,repeat) => { calls++; if (calls === 4) throw new Error("synthetic crash"); return mExec(t.taskId, repeat); };
  let crashed = false; try { await drive(partial, dir3, crashDeps); } catch { crashed = true; } assert(crashed); const before = partial.attempts[0].events.filter((e) => e.kind === "M").length; assert(before > 0);
  const resumeCounter = {m:0,r:0}; await drive(partial, dir3, successfulDeps(resumeCounter)); assert.equal(partial.status, "completed-awaiting-repeat-freeze"); assert(resumeCounter.m < 8*12*2, "resume replayed the whole pilot");

  const acceptedCounter = {m:0,r:0}; await drive(full, dir1, successfulDeps(acceptedCounter)); assert.equal(acceptedCounter.m, 0); assert.equal(acceptedCounter.r, 0); assert.equal(full.acceptedPairs.length, 8);

  const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), "p62-var-audit-")); const audited = emptyVarianceResult(manifest()); let systemOnce = true;
  const auditDeps = successfulDeps(); auditDeps.runM = async (_r,_s,t,_role,repeat) => { if (systemOnce) { systemOnce=false; return mExec(t.taskId, repeat, "system"); } return mExec(t.taskId, repeat); };
  await drive(audited, dir4, auditDeps); assert.equal(audited.status, "execution-needs-audit"); const flag = audited.auditFlags.find((f) => f.kind === "execution" && !f.resolvedAt); assert(flag);
  applyVariancePilotAdjudication(audited, { auditId: flag!.auditId, reviewer: "offline-test", reason: "generated artifact/compiler failure", finalDisposition: "scientific-failure", adjudicatedAt: "2026-09-21T00:00:00.000Z" }, "mocksha");
  assert.equal(audited.status, "running"); await drive(audited, dir4, successfulDeps()); assert.equal(audited.status, "completed-awaiting-repeat-freeze"); assert.equal(audited.acceptedPairs.length, 8);

  console.log("P6-2 exact-power + variance-pilot hardening verification passed.");
  console.log(`exact fixtures=${REFERENCE_POWER.length}; sigma floor=${P6_2_VARIANCE_SIGMA_FLOOR_M}; 8-pair DI integration scenarios=5`);
}
main().catch((e) => { console.error(e); process.exit(1); });
