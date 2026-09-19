import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { assembleContext, BudgetValue } from "../calibration/src/budget-assembler";
import { scoreProbes, summarizeScores } from "../calibration/src/probe-scorer";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import { OpenAIBackend } from "./src/agent-backend/openai";
import {
  buildOpenAIStructuredResponseRequestBody,
  estimateOpenAICostUsd,
  extractOutputText,
  extractRefusal,
  responseFailureDetails,
} from "./src/agent-backend/openai/shared";
import { runScoring } from "./src/scoring";
import type { TestSuiteResult, TokenUsage } from "./src/types";

const MODEL = "gpt-5.6-luna";
const REASONING = "high" as const;
const REPEATS = 3;
const PRIMARY_PROBE_BATCH_SIZE = 12;
const REFERENCE_PROBE_BATCH_SIZE = 8;
const PROBE_MAX_OUTPUT_TOKENS = 8000;
const PILOT_TASKS = ["T-local-2", "T-crosscut-1", "T-delayed-1", "T-crosscut-2", "T-local-1"] as const;

// Predeclared P6-0 engineering gates. These are calibration guards, not confirmatory statistics.
const P6_0_GATES = {
  b0BooleanMin: 0.35,
  b0BooleanMax: 0.65,
  fullBooleanMin: 0.85,
  minFullMinusB0: 0.25,
  adapterBooleanMin: 0.35,
  adapterBooleanMax: 0.65,
} as const;

const P6_0_CRITERIA_VERSION = "p6-0-v2-neutral-probes";
const P6_0_GATE_REVISION =
  "The first Luna live run exposed prompt-label leakage in the v1 matched-negative boolean design. " +
  "tests-only remains a diagnostic rather than a hard gate because visible tests are artifact evidence and may legitimately encode semantics. " +
  "Direct F5 leakage is guarded statically; adapter-only boolean chance is the hard structural-inference guard.";

// Predeclared P6-1 pilot classification rule (3 repeats per task):
// 2/3+ pass = provisional T_primary eligible; 0/3 = provisional floor/T_challenge candidate;
// 1/3 = hold; >=2 infrastructure/provider-invalid repeats = capability classification invalid.
const P6_1_RULE = {
  repeats: REPEATS,
  primaryMinPasses: 2,
  floorPasses: 0,
  invalidInfrastructureMin: 2,
} as const;

type ProbeContextKind = "b0" | "b1k" | "full" | "tests-only" | "adapter-only";

interface HeldOutTask {
  taskId: string;
  type?: string;
  visibleInstruction: string;
  taskSpecificTestCode?: string;
}

interface ProbeRepeatResult {
  context: ProbeContextKind;
  repeat: number;
  contextFiles: string[];
  canonicalContextTokens: number | null;
  booleanCorrect: number;
  booleanTotal: number;
  booleanAccuracy: number;
  referenceCorrect: number;
  referenceTotal: number;
  referenceAccuracy: number;
  byType: Record<string, { total: number; correct: number; accuracy: number }>;
  probeDetails: Array<{
    probeId: string;
    type: string;
    correct: boolean;
    agentAnswer: string;
    correctAnswer: string;
    parseError?: string;
  }>;
  actualModels: string[];
  usage: TokenUsage;
  estimatedCostUsd: number;
}

interface P61RepeatResult {
  taskId: string;
  taskType: string | null;
  repeat: number;
  passed: boolean;
  validity: "valid" | "infrastructure-invalid";
  failureCategory: string | null;
  failureReason: string | null;
  executionStatus: string;
  visible: ReturnType<typeof suiteDigest> | null;
  hidden: ReturnType<typeof suiteDigest> | null;
  taskSpecific: ReturnType<typeof suiteDigest> | null;
  protocolContractViolated: boolean | null;
  workingNote: string | null;
  actualModel: string | null;
  usage: TokenUsage | null;
  estimatedCostUsd: number | null;
}

function loadDirRecursive(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadDirRecursive(full, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).replace(/\\/g, "/")] = fs.readFileSync(full, "utf8");
    }
  }
}

function addUsage(target: TokenUsage, usage: any): void {
  if (!usage) return;
  target.input += usage.input_tokens ?? 0;
  target.output += usage.output_tokens ?? 0;
  target.cachedInput = (target.cachedInput ?? 0) + (usage.input_tokens_details?.cached_tokens ?? 0);
  target.cacheWriteInput = (target.cacheWriteInput ?? 0) + (usage.input_tokens_details?.cache_write_tokens ?? 0);
  target.reasoningOutput = (target.reasoningOutput ?? 0) + (usage.output_tokens_details?.reasoning_tokens ?? 0);
  target.total = (target.total ?? 0) + (usage.total_tokens ?? 0);
}

function probePrompt(contextFiles: Record<string, string>, probes: GeneratedProbe[]): string {
  const repo = Object.keys(contextFiles).sort().map((p) => `\n--- ${p} ---\n${contextFiles[p]}`).join("");
  const questions = probes.map((p) => {
    const lines = [`[${p.probeId}] (${p.type})`, p.prompt];
    if (p.type === "boolean") lines.push('Answer exactly "true" or "false".');
    else if (p.options?.length) lines.push(`Options: ${p.options.join(", ")}`);
    return lines.join("\n");
  }).join("\n\n");
  return `REPOSITORY FILES:${repo || "\n(none)"}\n\nQUESTIONS:\n${questions}\n\nReturn one string answer for every exact probe ID.`;
}

async function answerProbeBatch(
  client: OpenAI,
  contextFiles: Record<string, string>,
  probes: GeneratedProbe[]
): Promise<{ answers: Record<string, string>; model: string; usage: any; cost: number }> {
  const properties = Object.fromEntries(probes.map((p) => [p.probeId, { type: "string" }]));
  const body = buildOpenAIStructuredResponseRequestBody({
    options: {
      model: MODEL,
      reasoningEffort: REASONING,
      maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      storeResponses: false,
      serviceTier: "default",
      promptCacheMode: "implicit",
    },
    responseInput: [{ role: "user", content: probePrompt(contextFiles, probes) }],
    outputSpec: {
      instructions: "Answer semantic probes about the supplied TypeScript repository. Use only supplied repository evidence. If evidence is absent, make the best forced-choice answer rather than claiming hidden knowledge.",
      schemaName: "p6_probe_answers_v1",
      schema: { type: "object", properties, required: probes.map((p) => p.probeId), additionalProperties: false },
    },
  });
  const response = await client.responses.create(body as any);
  const refusal = extractRefusal(response);
  const failure = responseFailureDetails(response);
  if (refusal) throw new Error(`probe-refusal:${refusal}`);
  if (response.status !== "completed") {
    throw new Error(`probe-response-${response.status}:${failure.incompleteReason ?? failure.providerErrorMessage ?? "unknown"}`);
  }
  const raw = extractOutputText(response);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const p of probes) answers[p.probeId] = String(parsed[p.probeId] ?? "");
  return {
    answers,
    model: response.model,
    usage: response.usage,
    cost: estimateOpenAICostUsd(MODEL, response.usage, "sync") ?? 0,
  };
}

function makeProbeContext(
  kind: ProbeContextKind,
  repository: Record<string, string>
): { files: Record<string, string>; canonicalTokens: number | null } {
  if (kind === "tests-only") {
    return { files: Object.fromEntries(Object.entries(repository).filter(([p]) => p.startsWith("tests/"))), canonicalTokens: null };
  }
  if (kind === "adapter-only") {
    return { files: Object.fromEntries(Object.entries(repository).filter(([p]) => p === "src/protocol_adapter.ts")), canonicalTokens: null };
  }
  const budget: BudgetValue = kind === "b0" ? 0 : kind === "b1k" ? 1000 : "full";
  const ctx = assembleContext(repository, budget, "system1");
  return { files: ctx.files, canonicalTokens: ctx.canonicalTokens };
}

async function runProbeRepeat(
  client: OpenAI,
  kind: ProbeContextKind,
  repeat: number,
  repository: Record<string, string>,
  probes: GeneratedProbe[]
): Promise<ProbeRepeatResult> {
  const ctx = makeProbeContext(kind, repository);
  const answers: Record<string, string> = {};
  const actualModels: string[] = [];
  const usage: TokenUsage = { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 };
  let estimatedCostUsd = 0;

  // Keep boolean primary probes isolated from mc/stp reference probes.
  // Reference probes are diagnostic only, so use smaller batches to avoid reasoning-token truncation.
  const probeGroups = [
    { probes: probes.filter((p) => p.type === "boolean"), batchSize: PRIMARY_PROBE_BATCH_SIZE },
    { probes: probes.filter((p) => p.type !== "boolean"), batchSize: REFERENCE_PROBE_BATCH_SIZE },
  ].filter((group) => group.probes.length > 0);
  for (const group of probeGroups) {
    for (let i = 0; i < group.probes.length; i += group.batchSize) {
      const batch = group.probes.slice(i, i + group.batchSize);
      const r = await answerProbeBatch(client, ctx.files, batch);
      Object.assign(answers, r.answers);
      actualModels.push(r.model);
      addUsage(usage, r.usage);
      estimatedCostUsd += r.cost;
    }
  }

  const scored = scoreProbes(probes, answers);
  const summary = summarizeScores(scored, probes);
  const typeById = new Map(probes.map((p) => [p.probeId, p.type]));
  const bool = scored.filter((r) => typeById.get(r.probeId) === "boolean");
  const reference = scored.filter((r) => ["multiple_choice", "state_transition_prediction"].includes(typeById.get(r.probeId) ?? ""));
  return {
    context: kind,
    repeat,
    contextFiles: Object.keys(ctx.files).sort(),
    canonicalContextTokens: ctx.canonicalTokens,
    booleanCorrect: bool.filter((r) => r.correct).length,
    booleanTotal: bool.length,
    booleanAccuracy: bool.length ? bool.filter((r) => r.correct).length / bool.length : 0,
    referenceCorrect: reference.filter((r) => r.correct).length,
    referenceTotal: reference.length,
    referenceAccuracy: reference.length ? reference.filter((r) => r.correct).length / reference.length : 0,
    byType: summary.byType,
    probeDetails: scored.map((r) => ({
      probeId: r.probeId,
      type: typeById.get(r.probeId) ?? "unknown",
      correct: r.correct,
      agentAnswer: r.agentAnswer,
      correctAnswer: r.correctAnswer,
      parseError: r.parseError,
    })),
    actualModels,
    usage,
    estimatedCostUsd,
  };
}

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); }

function validateMutationPaths(files: Record<string, string>): string | null {
  for (const raw of Object.keys(files)) {
    const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) return `write-escape:${raw}`;
    if (!(normalized.startsWith("src/") || normalized.startsWith("tests/"))) return `write-outside-repository-contract:${raw}`;
  }
  return null;
}

function suiteDigest(s: TestSuiteResult) {
  return {
    passed: s.passed,
    numPassed: s.numPassed,
    numFailed: s.numFailed,
    executionError: s.executionError ?? null,
    failedCases: s.testCases.filter((t) => !t.passed).map((t) => ({ testName: t.testName, error: t.error ?? null })),
  };
}

function failureReasonFromSuites(visible: TestSuiteResult, hidden: TestSuiteResult, taskSpecific: TestSuiteResult | null): string | null {
  const parts: string[] = [];
  for (const [name, suite] of [["visible", visible], ["hidden", hidden], ["task-specific", taskSpecific]] as const) {
    if (!suite) continue;
    if (suite.executionError) parts.push(`${name}:execution:${suite.executionError}`);
    for (const t of suite.testCases.filter((x) => !x.passed)) parts.push(`${name}:${t.testName}${t.error ? `:${t.error}` : ""}`);
  }
  return parts.length ? parts.join(" | ") : null;
}

function infrastructureInvalid(status: string, category: string | undefined): boolean {
  return status === "provider-error" || category === "provider";
}

async function runTaskRepeat(
  repository: Record<string, string>,
  swDir: string,
  task: HeldOutTask,
  repeat: number
): Promise<P61RepeatResult> {
  const backend = new OpenAIBackend({
    model: MODEL,
    reasoningEffort: REASONING,
    maxOutputTokens: 7000,
    requestTimeoutMs: 180000,
    maxRetries: 2,
    storeResponses: false,
    maxToolRounds: 0,
    serviceTier: "default",
    promptCacheMode: "implicit",
  });
  const agent = await backend.run({ contextFiles: repository, visibleInstruction: task.visibleInstruction, contextBudget: "full" });
  if (agent.executionStatus !== "ok") {
    const invalid = infrastructureInvalid(agent.executionStatus, agent.error?.category);
    return {
      taskId: task.taskId, taskType: task.type ?? null, repeat, passed: false,
      validity: invalid ? "infrastructure-invalid" : "valid",
      failureCategory: agent.error?.category ?? agent.executionStatus,
      failureReason: agent.error?.message ?? agent.executionStatus,
      executionStatus: agent.executionStatus,
      visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null,
      workingNote: agent.explicitWorkingNote, actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null, estimatedCostUsd: agent.estimatedCostUsd,
    };
  }
  const pathError = validateMutationPaths(agent.modifiedFiles);
  if (pathError) {
    return {
      taskId: task.taskId, taskType: task.type ?? null, repeat, passed: false, validity: "valid",
      failureCategory: "mutation-validation", failureReason: pathError, executionStatus: "mutation-validation-failure",
      visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null,
      workingNote: agent.explicitWorkingNote, actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null, estimatedCostUsd: agent.estimatedCostUsd,
    };
  }
  const merged = { ...repository, ...agent.modifiedFiles };
  try {
    const scoring = await runScoring(merged, swDir, task.taskSpecificTestCode);
    const passed = scoring.visibleTests.passed && scoring.hiddenTests.passed && (scoring.taskSpecificTests?.passed ?? true) && !scoring.protocolContractViolated;
    return {
      taskId: task.taskId, taskType: task.type ?? null, repeat, passed, validity: "valid",
      failureCategory: passed ? null : scoring.protocolContractViolated ? "protocol-contract" : "test-failure",
      failureReason: passed ? null : failureReasonFromSuites(scoring.visibleTests, scoring.hiddenTests, scoring.taskSpecificTests),
      executionStatus: agent.executionStatus,
      visible: suiteDigest(scoring.visibleTests), hidden: suiteDigest(scoring.hiddenTests),
      taskSpecific: scoring.taskSpecificTests ? suiteDigest(scoring.taskSpecificTests) : null,
      protocolContractViolated: scoring.protocolContractViolated,
      workingNote: agent.explicitWorkingNote, actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null, estimatedCostUsd: agent.estimatedCostUsd,
    };
  } catch (e) {
    return {
      taskId: task.taskId, taskType: task.type ?? null, repeat, passed: false, validity: "infrastructure-invalid",
      failureCategory: "harness", failureReason: e instanceof Error ? e.stack ?? e.message : String(e), executionStatus: agent.executionStatus,
      visible: null, hidden: null, taskSpecific: null, protocolContractViolated: null,
      workingNote: agent.explicitWorkingNote, actualModel: agent.modelProvenance.actualModel,
      usage: agent.tokenUsage ?? null, estimatedCostUsd: agent.estimatedCostUsd,
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for P6 live preflight");
  const root = path.resolve(__dirname, "..");
  const swDir = path.join(root, "synthetic-world");
  const repoDir = path.join(swDir, "repository");
  const repository: Record<string, string> = {};
  loadDirRecursive(repoDir, repoDir, repository);
  const probes = JSON.parse(fs.readFileSync(path.join(root, "calibration/fixtures/probe-bank-stage1.json"), "utf8")) as GeneratedProbe[];
  const audit = JSON.parse(fs.readFileSync(path.join(root, "calibration/fixtures/probe-bank-stage1.audit.json"), "utf8"));
  const tasks = JSON.parse(fs.readFileSync(path.join(swDir, "heldout_tasks.json"), "utf8")) as HeldOutTask[];

  const staticAudit = {
    total: audit.audit.total,
    designVersion: audit.designVersion,
    booleanTotal: audit.audit.booleanTotal,
    booleanTrue: audit.audit.booleanTrue,
    booleanFalse: audit.audit.booleanFalse,
    counterexampleNegativeCount: audit.audit.counterexampleNegativeCount,
    surfaceNeutralBooleanCount: audit.audit.surfaceNeutralBooleanCount,
    f5Warnings: audit.audit.f5Warnings,
    rawGroundTruthIdLeakage: audit.audit.rawGroundTruthIdLeakage,
    booleanCueWarnings: audit.audit.booleanCueWarnings,
    booleanIdCueWarnings: audit.audit.booleanIdCueWarnings,
  };
  if (
    staticAudit.designVersion !== "stage1-neutral-relation-v2" ||
    staticAudit.booleanTotal !== 12 ||
    staticAudit.booleanTrue !== 6 ||
    staticAudit.booleanFalse !== 6 ||
    staticAudit.counterexampleNegativeCount !== 6 ||
    staticAudit.surfaceNeutralBooleanCount !== 12 ||
    staticAudit.f5Warnings.length ||
    staticAudit.rawGroundTruthIdLeakage.length ||
    staticAudit.booleanCueWarnings.length ||
    staticAudit.booleanIdCueWarnings.length
  ) {
    throw new Error(`P6-0 static probe audit failed: ${JSON.stringify(staticAudit)}`);
  }

  console.log("P6-0 PREDECLARED GATES", JSON.stringify(P6_0_GATES));
  console.log("P6-1 PREDECLARED RULE", JSON.stringify(P6_1_RULE));
  console.log("P6-1 PILOT TASKS", PILOT_TASKS.join(","));

  const client = new OpenAI({ timeout: 180000, maxRetries: 2 });
  const probeResults: ProbeRepeatResult[] = [];
  for (const context of ["b0", "b1k", "full", "tests-only", "adapter-only"] as ProbeContextKind[]) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      const r = await runProbeRepeat(client, context, repeat, repository, probes);
      probeResults.push(r);
      console.log(`P6-0 ${context} repeat=${repeat} bool=${r.booleanCorrect}/${r.booleanTotal} ref=${r.referenceCorrect}/${r.referenceTotal} cost=$${r.estimatedCostUsd.toFixed(6)}`);
    }
  }
  const acc = (context: ProbeContextKind, key: "booleanAccuracy" | "referenceAccuracy") => mean(probeResults.filter((r) => r.context === context).map((r) => r[key]));
  const b0 = acc("b0", "booleanAccuracy");
  const b1k = acc("b1k", "booleanAccuracy");
  const full = acc("full", "booleanAccuracy");
  const testsOnly = acc("tests-only", "booleanAccuracy");
  const adapterBool = acc("adapter-only", "booleanAccuracy");
  const adapterRef = acc("adapter-only", "referenceAccuracy");
  const b0Ref = acc("b0", "referenceAccuracy");
  const b1kRef = acc("b1k", "referenceAccuracy");
  const p60Checks = {
    b0ChanceBand: b0 >= P6_0_GATES.b0BooleanMin && b0 <= P6_0_GATES.b0BooleanMax,
    fullHeadroom: full >= P6_0_GATES.fullBooleanMin,
    doseResponse: full - b0 >= P6_0_GATES.minFullMinusB0,
    adapterPrimaryChance: adapterBool >= P6_0_GATES.adapterBooleanMin && adapterBool <= P6_0_GATES.adapterBooleanMax,
  };
  const p60Passed = Object.values(p60Checks).every(Boolean);
  const f9Diagnostic = {
    b0ReferenceAccuracy: b0Ref,
    b1kReferenceAccuracy: b1kRef,
    adapterOnlyReferenceAccuracy: adapterRef,
    adapterOnlyBooleanAccuracy: adapterBool,
    recurrenceObserved: adapterRef >= 0.5 || b1kRef >= 0.8,
    interpretation: "Reference-probe F9 recurrence is diagnostic and does not fail P6-0 while boolean primary remains valid; mc/stp stay reference-only.",
  };
  const f5Diagnostic = {
    staticDirectLeakageWarnings: staticAudit.f5Warnings,
    testsOnlyBooleanAccuracy: testsOnly,
    testsOnlyMinusB0: testsOnly - b0,
    interpretation: "tests-only is retained as an F5 diagnostic, not a hard gate: visible tests are inherited artifact evidence and can legitimately support semantic inference. B=0 chance plus the static direct-leakage scan guards prompt/test answer leakage.",
  };
  console.log("P6-0 SUMMARY", JSON.stringify({ criteriaVersion: P6_0_CRITERIA_VERSION, b0, b1k, full, testsOnly, adapterBool, p60Checks, f5Diagnostic, f9Diagnostic, p60Passed }, null, 2));

  const outputBase: any = {
    meta: { model: MODEL, reasoningEffort: REASONING, repeats: REPEATS, generatedAt: new Date().toISOString() },
    criteria: { p6_0_version: P6_0_CRITERIA_VERSION, p6_0_revision: P6_0_GATE_REVISION, p6_0: P6_0_GATES, p6_1: P6_1_RULE },
    p6_0: { staticAudit, probeResults, summary: { b0, b1k, full, testsOnly, adapterBool, checks: p60Checks, f5Diagnostic, f9Diagnostic, passed: p60Passed } },
    p6_1: null,
  };

  if (!p60Passed) {
    const outDir = path.join(root, "runs/_smoke", `p6-preflight-luna__${new Date().toISOString().replace(/[:.]/g, "-")}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(outputBase, null, 2));
    console.error(`P6-0 FAILED; P6-1 intentionally not started. result=${path.join(outDir, "result.json")}`);
    process.exitCode = 3;
    return;
  }

  const selected = PILOT_TASKS.map((id) => tasks.find((t) => t.taskId === id) ?? (() => { throw new Error(`Missing task ${id}`); })());
  const taskResults: P61RepeatResult[] = [];
  for (const task of selected) {
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      const r = await runTaskRepeat(repository, swDir, task, repeat);
      taskResults.push(r);
      console.log(`P6-1 ${task.taskId} repeat=${repeat} passed=${r.passed} validity=${r.validity} category=${r.failureCategory ?? "none"} reason=${r.failureReason ?? "none"} cost=$${(r.estimatedCostUsd ?? 0).toFixed(6)}`);
    }
  }
  const classifications = selected.map((task) => {
    const rs = taskResults.filter((r) => r.taskId === task.taskId);
    const valid = rs.filter((r) => r.validity === "valid");
    const infrastructureInvalidCount = rs.length - valid.length;
    const passes = valid.filter((r) => r.passed).length;
    let classification: string;
    if (infrastructureInvalidCount >= P6_1_RULE.invalidInfrastructureMin) classification = "invalid-capability-classification";
    else if (passes >= P6_1_RULE.primaryMinPasses) classification = "provisional-T_primary-eligible";
    else if (passes === P6_1_RULE.floorPasses && valid.length >= 2) classification = "provisional-floor-T_challenge-candidate";
    else classification = "hold-more-repeats";
    return { taskId: task.taskId, taskType: task.type ?? null, passes, validRepeats: valid.length, infrastructureInvalidCount, classification };
  });
  outputBase.p6_1 = { pilotTasks: PILOT_TASKS, taskResults, classifications };

  const totalProbeCost = probeResults.reduce((s, r) => s + r.estimatedCostUsd, 0);
  const totalTaskCost = taskResults.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);
  outputBase.cost = { p6_0: totalProbeCost, p6_1: totalTaskCost, total: totalProbeCost + totalTaskCost };
  const outDir = path.join(root, "runs/_smoke", `p6-preflight-luna__${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(outputBase, null, 2));
  console.log("P6-1 CLASSIFICATIONS", JSON.stringify(classifications, null, 2));
  console.log(`P6-0/P6-1 COMPLETE totalCost=$${(totalProbeCost + totalTaskCost).toFixed(6)} result=${path.join(outDir, "result.json")}`);
  console.log("STOP: P6-2 and later phases were not executed.");
}

main().catch((e) => {
  console.error("p6-preflight-live failed:", e);
  process.exit(1);
});
