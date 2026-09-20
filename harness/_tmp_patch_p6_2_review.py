from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"missing replacement target in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"replacement target count != 1 in {path}: {text.count(old)}")
    path.write_text(text.replace(old, new))


def regex_once(path: Path, pattern: str, repl: str):
    text = path.read_text()
    updated, count = re.subn(pattern, repl, text, flags=re.S)
    if count != 1:
        raise SystemExit(f"regex replacement count {count} in {path}: {pattern[:120]}")
    path.write_text(updated)


# ---------------------------------------------------------------------------
# 1) M summary: infrastructure-invalid is not part of the scientific denominator.
# ---------------------------------------------------------------------------
af = ROOT / "harness/src/p6/af-baseline.ts"
replace_once(
    af,
    'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v1";',
    'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v2-prelive-hardening";'
)
replace_once(
    af,
    '''export interface P62RoleSummary {
  taskCount: number;
  repeatCount: number;
  passed: number;
  passRate: number | null;
}''',
    '''export interface P62RoleSummary {
  taskCount: number;
  totalRepeats: number;
  scientificallyValidRepeats: number;
  infrastructureInvalidRepeats: number;
  passed: number;
  passRate: number | null;
}'''
)
replace_once(
    af,
    '''    const subset = results.filter((item) => item.role === role);
    const ids = new Set(subset.map((item) => item.taskId));
    const passed = subset.filter((item) => item.passed).length;
    return {
      taskCount: ids.size,
      repeatCount: subset.length,
      passed,
      passRate: subset.length ? passed / subset.length : null,
    };''',
    '''    const subset = results.filter((item) => item.role === role);
    const ids = new Set(subset.map((item) => item.taskId));
    const scientificallyValid = subset.filter((item) => item.failureDomain !== "infrastructure");
    const passed = scientificallyValid.filter((item) => item.passed).length;
    return {
      taskCount: ids.size,
      totalRepeats: subset.length,
      scientificallyValidRepeats: scientificallyValid.length,
      infrastructureInvalidRepeats: subset.length - scientificallyValid.length,
      passed,
      passRate: scientificallyValid.length ? passed / scientificallyValid.length : null,
    };'''
)

# ---------------------------------------------------------------------------
# 2) P6-2 runner: journal roots, Rsem failure journaling/DI, timeout/retry, audit flags.
# ---------------------------------------------------------------------------
runner = ROOT / "harness/p6-af-baseline-live.ts"
replace_once(
    runner,
    '''export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v1";
export const P6_2_ARTIFACT_LAYOUT_VERSION = "p6-2-af-baseline-artifacts-v1";''',
    '''export const P6_2_RUN_SCHEMA_VERSION = "p6-2-af-baseline-result-v2";
export const P6_2_ARTIFACT_LAYOUT_VERSION = "p6-2-af-baseline-artifacts-v2";'''
)

regex_once(
    runner,
    r'''export interface RSemProbeRepeatResult \{.*?\n\}\n\nexport interface P62ExecutionManifest''',
    '''export type P62RSemFailureDomain = "none" | "semantic" | "protocol" | "system" | "infrastructure";

export interface P62RSemModelProvenance {
  provider: "openai";
  requestedModel: typeof P6_2_MODEL;
  actualModel: string | null;
  responseId: string | null;
  responseStatus: string | null;
  reasoningEffort: typeof P6_2_REASONING;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
  sdkVersion: string | null;
  providerErrorCode: string | null;
}

export interface RSemProbeRepeatResult {
  repeat: number;
  designVersion: string;
  executionStatus: string;
  validity: "valid" | "infrastructure-invalid";
  failureDomain: P62RSemFailureDomain;
  failureReason: string | null;
  rawResponse: string;
  modelProvenance: P62RSemModelProvenance;
  booleanCorrect: number | null;
  booleanTotal: number;
  booleanAccuracy: number | null;
  probeDetails: Array<{
    probeId: string;
    correct: boolean;
    agentAnswer: string;
    correctAnswer: string;
    parseError?: string;
  }>;
  actualModel: string | null;
  usage: TokenUsage;
  estimatedCostUsd: number | null;
}

export interface P62ExecutionManifest'''
)

replace_once(
    runner,
    '''  status: "running" | "completed";
  startedAt: string;''',
    '''  status: "running" | "needs-audit" | "completed";
  auditFlags: Array<{
    measurement: "M" | "Rsem";
    taskId: string | null;
    repeat: number;
    failureDomain: string;
    executionStatus: string;
    reason: string | null;
  }>;
  startedAt: string;'''
)

replace_once(
    runner,
    '''    status: "running",
    startedAt: now,''',
    '''    status: "running",
    auditFlags: [],
    startedAt: now,'''
)

replace_once(
    runner,
    '''  const r = result.measurements.Rsem.repeatResults;
  result.measurements.Rsem.meanBooleanAccuracy = r.length
    ? r.reduce((sum, item) => sum + item.booleanAccuracy, 0) / r.length
    : null;
  result.estimatedCostUsd =
    result.measurements.M.repeatResults.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0) +
    r.reduce((sum, item) => sum + item.estimatedCostUsd, 0);''',
    '''  const r = result.measurements.Rsem.repeatResults;
  const validR = r.filter((item) =>
    item.validity === "valid" && item.failureDomain === "none" && item.booleanAccuracy !== null
  );
  result.measurements.Rsem.meanBooleanAccuracy = validR.length
    ? validR.reduce((sum, item) => sum + (item.booleanAccuracy ?? 0), 0) / validR.length
    : null;
  result.estimatedCostUsd =
    result.measurements.M.repeatResults.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0) +
    r.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);'''
)

# Fix visible-test path used to construct the full Stage 1 bank.
replace_once(
    runner,
    'const visibleTestPath = path.join(syntheticWorldDir, "repository/tests/visible.test.ts");',
    'const visibleTestPath = path.join(syntheticWorldDir, "repository/tests/rules.visible.test.ts");'
)

# Replace the Rsem call path with an injectable, failure-recording implementation.
regex_once(
    runner,
    r'''function addUsage\(target: TokenUsage, usage: any\): void \{.*?\n\}\n\nasync function runRSemRepeat\(.*?\n\}\n\nfunction writeResult''',
    '''function addUsage(target: TokenUsage, usage: any): void {
  if (!usage) return;
  target.input += usage.input_tokens ?? 0;
  target.output += usage.output_tokens ?? 0;
  target.cachedInput = (target.cachedInput ?? 0) + (usage.input_tokens_details?.cached_tokens ?? 0);
  target.cacheWriteInput = (target.cacheWriteInput ?? 0) + (usage.input_tokens_details?.cache_write_tokens ?? 0);
  target.reasoningOutput = (target.reasoningOutput ?? 0) + (usage.output_tokens_details?.reasoning_tokens ?? 0);
  target.total = (target.total ?? 0) + (usage.total_tokens ?? 0);
}

function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 };
}

export interface P62ProbeClient {
  responses: { create(body: any): Promise<any> };
}

export type P62ProbeClientFactory = (options: { timeout: number; maxRetries: number }) => P62ProbeClient;

const defaultProbeClientFactory: P62ProbeClientFactory = (options) => new OpenAI(options) as P62ProbeClient;

function probeModelProvenance(response: any | null, providerErrorCode: string | null = null): P62RSemModelProvenance {
  return {
    provider: "openai",
    requestedModel: P6_2_MODEL,
    actualModel: response?.model ?? null,
    responseId: response?.id ?? null,
    responseStatus: response?.status ?? (providerErrorCode ? "provider-error" : null),
    reasoningEffort: P6_2_REASONING,
    maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    sdkVersion: getPackageVersion("openai"),
    providerErrorCode,
  };
}

function probeFailure(args: {
  repeat: number;
  executionStatus: string;
  validity: "valid" | "infrastructure-invalid";
  failureDomain: P62RSemFailureDomain;
  failureReason: string;
  rawResponse: string;
  response: any | null;
  usage: TokenUsage;
  estimatedCostUsd: number | null;
  booleanTotal: number;
  probeDetails?: RSemProbeRepeatResult["probeDetails"];
  providerErrorCode?: string | null;
}): RSemProbeRepeatResult {
  return {
    repeat: args.repeat,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    executionStatus: args.executionStatus,
    validity: args.validity,
    failureDomain: args.failureDomain,
    failureReason: args.failureReason,
    rawResponse: args.rawResponse,
    modelProvenance: probeModelProvenance(args.response, args.providerErrorCode ?? null),
    booleanCorrect: null,
    booleanTotal: args.booleanTotal,
    booleanAccuracy: null,
    probeDetails: args.probeDetails ?? [],
    actualModel: args.response?.model ?? null,
    usage: args.usage,
    estimatedCostUsd: args.estimatedCostUsd,
  };
}

export async function runRSemRepeat(
  repository: Record<string, string>,
  probes: GeneratedProbe[],
  repeat: number,
  clientFactory: P62ProbeClientFactory = defaultProbeClientFactory
): Promise<RSemProbeRepeatResult> {
  const properties = Object.fromEntries(probes.map((probe) => [probe.probeId, { type: "string" }]));
  const schema = { type: "object", properties, required: probes.map((probe) => probe.probeId), additionalProperties: false };
  const body = buildOpenAIStructuredResponseRequestBody({
    options: {
      model: P6_2_MODEL,
      reasoningEffort: P6_2_REASONING,
      maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      storeResponses: false,
      serviceTier: SERVICE_TIER,
      promptCacheMode: PROMPT_CACHE_MODE,
    },
    responseInput: [{ role: "user", content: probePrompt(repository, probes) }],
    outputSpec: {
      instructions: "Answer semantic probes about the supplied TypeScript repository. Use only supplied repository evidence. If evidence is absent, make the best forced-choice answer rather than claiming hidden knowledge.",
      schemaName: P6_2_PROBE_SCHEMA_VERSION.replace(/-/g, "_"),
      schema,
    },
  });

  const usage = emptyUsage();
  let response: any;
  try {
    const client = clientFactory({ timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
    response = await client.responses.create(body as any);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const providerErrorCode = typeof (error as any)?.code === "string" ? (error as any).code : null;
    return probeFailure({
      repeat,
      executionStatus: "provider-error",
      validity: "infrastructure-invalid",
      failureDomain: "infrastructure",
      failureReason: message,
      rawResponse: "",
      response: null,
      usage,
      estimatedCostUsd: null,
      booleanTotal: probes.length,
      providerErrorCode,
    });
  }

  addUsage(usage, response.usage);
  const rawResponse = extractOutputText(response);
  const estimatedCostUsd = estimateOpenAICostUsd(P6_2_MODEL, response.usage, "sync");
  const refusal = extractRefusal(response);
  const failure = responseFailureDetails(response);
  if (refusal) {
    return probeFailure({
      repeat,
      executionStatus: "response-refusal",
      validity: "infrastructure-invalid",
      failureDomain: "infrastructure",
      failureReason: refusal,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
      providerErrorCode: failure.providerErrorCode,
    });
  }
  if (response.status !== "completed") {
    const executionStatus = response.status === "incomplete"
      ? "response-incomplete"
      : response.status === "failed"
        ? "response-failed"
        : "response-not-completed";
    return probeFailure({
      repeat,
      executionStatus,
      validity: "infrastructure-invalid",
      failureDomain: "infrastructure",
      failureReason: failure.incompleteReason ?? failure.providerErrorMessage ?? `response status=${response.status}`,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
      providerErrorCode: failure.providerErrorCode,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawResponse) as Record<string, unknown>;
  } catch (error) {
    return probeFailure({
      repeat,
      executionStatus: "output-parse-failure",
      validity: "valid",
      failureDomain: "protocol",
      failureReason: `Invalid structured JSON: ${error instanceof Error ? error.message : String(error)}`,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
    });
  }

  const answers = Object.fromEntries(probes.map((probe) => [probe.probeId, String(parsed[probe.probeId] ?? "")]));
  let scored: ReturnType<typeof scoreProbes>;
  try {
    scored = scoreProbes(probes, answers);
  } catch (error) {
    return probeFailure({
      repeat,
      executionStatus: "probe-scoring-error",
      validity: "infrastructure-invalid",
      failureDomain: "system",
      failureReason: error instanceof Error ? error.message : String(error),
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: probes.length,
    });
  }
  const details = scored.map((item) => ({
    probeId: item.probeId,
    correct: item.correct,
    agentAnswer: item.agentAnswer,
    correctAnswer: item.correctAnswer,
    parseError: item.parseError,
  }));
  const parseErrors = details.filter((item) => item.parseError);
  if (parseErrors.length > 0) {
    return probeFailure({
      repeat,
      executionStatus: "answer-protocol-failure",
      validity: "valid",
      failureDomain: "protocol",
      failureReason: `Malformed forced-choice answer(s): ${parseErrors.map((item) => item.probeId).join(",")}`,
      rawResponse,
      response,
      usage,
      estimatedCostUsd,
      booleanTotal: scored.length,
      probeDetails: details,
    });
  }

  const correct = scored.filter((item) => item.correct).length;
  return {
    repeat,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    executionStatus: "ok",
    validity: "valid",
    failureDomain: "none",
    failureReason: null,
    rawResponse,
    modelProvenance: probeModelProvenance(response),
    booleanCorrect: correct,
    booleanTotal: scored.length,
    booleanAccuracy: scored.length ? correct / scored.length : 0,
    probeDetails: details,
    actualModel: response.model ?? null,
    usage,
    estimatedCostUsd,
  };
}

function writeResult'''
)

# Structural separation: M journal is rooted under runDir/m, Rsem under runDir/rsem.
replace_once(
    runner,
    '''function probeJournalDirectory(runDir: string, repeat: number): string {
  return path.join(runDir, "rsem", `repeat-${repeat}`);
}''',
    '''export function mJournalDirectory(runDir: string): string {
  return path.join(runDir, "m");
}

function probeJournalDirectory(runDir: string, repeat: number): string {
  return path.join(runDir, "rsem", `repeat-${repeat}`);
}'''
)

# Add audit helpers before main.
replace_once(
    runner,
    '''function createResultPath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", "_calibration", `p6-2-af-baseline-luna__${stamp}`, "result.json");
}

async function main(): Promise<void> {''',
    '''function createResultPath(repoRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", "_calibration", `p6-2-af-baseline-luna__${stamp}`, "result.json");
}

function requiresAudit(failureDomain: string): boolean {
  return failureDomain === "infrastructure" || failureDomain === "system";
}

function markNeedsAudit(
  result: P62AfBaselineResult,
  flag: P62AfBaselineResult["auditFlags"][number]
): void {
  result.status = "needs-audit";
  result.auditFlags.push(flag);
  recomputeResult(result);
}

async function main(): Promise<void> {'''
)

replace_once(
    runner,
    '''    assertP62ResumeCompatible(result, manifest, taskBankRaw, repository);
    const mRecovery = reconcileRepeatJournal(runDir, result.measurements.M.repeatResults);''',
    '''    assertP62ResumeCompatible(result, manifest, taskBankRaw, repository);
    if (result.status === "needs-audit") {
      throw new Error("Resume refused: P6-2 result is needs-audit; inspect the recorded auditFlags before continuation");
    }
    const mRecovery = reconcileRepeatJournal(mJournalDirectory(runDir), result.measurements.M.repeatResults);'''
)

replace_once(
    runner,
    '''    commitRepeatArtifactsAtomic(runDir, classified, execution.artifacts);
    result.measurements.M.repeatResults.push(classified);
    recomputeResult(result);
    writeResult(resultPath, result);
    console.log(`P6-2 M ${classified.taskId} repeat=${classified.repeat} role=${classified.role} passed=${classified.passed} domain=${classified.failureDomain}`);''',
    '''    commitRepeatArtifactsAtomic(mJournalDirectory(runDir), classified, execution.artifacts);
    result.measurements.M.repeatResults.push(classified);
    recomputeResult(result);
    writeResult(resultPath, result);
    console.log(`P6-2 M ${classified.taskId} repeat=${classified.repeat} role=${classified.role} passed=${classified.passed} domain=${classified.failureDomain}`);
    if (requiresAudit(classified.failureDomain)) {
      markNeedsAudit(result, {
        measurement: "M",
        taskId: classified.taskId,
        repeat: classified.repeat,
        failureDomain: classified.failureDomain,
        executionStatus: classified.executionStatus,
        reason: classified.failureReason,
      });
      writeResult(resultPath, result);
      console.log("STOP: P6-2 entered needs-audit after structural/infrastructure M failure; no further repeats executed.");
      return;
    }'''
)

replace_once(
    runner,
    '''    const probeResult = await runRSemRepeat(repository, probeMaterial.booleanProbes, repeat);
    commitProbeResultAtomic(runDir, probeResult);
    result.measurements.Rsem.repeatResults.push(probeResult);
    recomputeResult(result);
    writeResult(resultPath, result);
    console.log(`P6-2 Rsem repeat=${repeat} accuracy=${probeResult.booleanAccuracy.toFixed(3)}`);''',
    '''    const probeResult = await runRSemRepeat(repository, probeMaterial.booleanProbes, repeat);
    commitProbeResultAtomic(runDir, probeResult);
    result.measurements.Rsem.repeatResults.push(probeResult);
    recomputeResult(result);
    writeResult(resultPath, result);
    console.log(`P6-2 Rsem repeat=${repeat} status=${probeResult.executionStatus} domain=${probeResult.failureDomain} accuracy=${probeResult.booleanAccuracy === null ? "null" : probeResult.booleanAccuracy.toFixed(3)}`);
    if (requiresAudit(probeResult.failureDomain)) {
      markNeedsAudit(result, {
        measurement: "Rsem",
        taskId: null,
        repeat: probeResult.repeat,
        failureDomain: probeResult.failureDomain,
        executionStatus: probeResult.executionStatus,
        reason: probeResult.failureReason,
      });
      writeResult(resultPath, result);
      console.log("STOP: P6-2 entered needs-audit after structural/infrastructure Rsem failure; no further repeats executed.");
      return;
    }'''
)

# ---------------------------------------------------------------------------
# 3) Offline verifier: integration regression, Rsem failure injection, summary denominator.
# ---------------------------------------------------------------------------
verify = ROOT / "harness/verify-p6-af-baseline.ts"
replace_once(
    verify,
    '''  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
} from "./src/p6/af-baseline";''',
    '''  P6_2_TASK_BANK_VERSION,
  classifyP62MRepeat,
  planP62MRepeats,
  planP62ProbeRepeats,
  selectP62TaskBank,
  summarizeP62M,
} from "./src/p6/af-baseline";'''
)
replace_once(
    verify,
    '''  buildP62ExecutionManifest,
  commitProbeResultAtomic,
  createP62Result,
  reconcileProbeJournal,
  type P62AfBaselineResult,
  type RSemProbeRepeatResult,
} from "./p6-af-baseline-live";''',
    '''  buildP62ExecutionManifest,
  commitProbeResultAtomic,
  createP62Result,
  mJournalDirectory,
  reconcileProbeJournal,
  runRSemRepeat,
  type P62AfBaselineResult,
  type P62ProbeClientFactory,
  type RSemProbeRepeatResult,
} from "./p6-af-baseline-live";'''
)

# Insert helper fake response/client functions before main.
replace_once(
    verify,
    '''function assertThrowsMessage(fn: () => void, pattern: RegExp): void {
  let thrown: unknown = null;
  try { fn(); } catch (error) { thrown = error; }
  assert(thrown instanceof Error, `Expected error matching ${pattern}`);
  assert.match(thrown.message, pattern);
}

async function main(): Promise<void> {''',
    '''function assertThrowsMessage(fn: () => void, pattern: RegExp): void {
  let thrown: unknown = null;
  try { fn(); } catch (error) { thrown = error; }
  assert(thrown instanceof Error, `Expected error matching ${pattern}`);
  assert.match(thrown.message, pattern);
}

function mockUsage() {
  return {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
}

function completedProbeResponse(outputText: string) {
  return {
    id: "resp_mock",
    status: "completed",
    model: "gpt-5.6-luna-mock",
    output_text: outputText,
    output: [],
    usage: mockUsage(),
    service_tier: "default",
  };
}

function fakeProbeFactory(
  outcome: any | Error,
  captured?: Array<{ timeout: number; maxRetries: number }>
): P62ProbeClientFactory {
  return (options) => {
    captured?.push(options);
    return {
      responses: {
        create: async () => {
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      },
    };
  };
}

async function main(): Promise<void> {'''
)

# Expand summary check after protocol mock.
replace_once(
    verify,
    '''  assert.equal(protocolMock.failureDomain, "protocol");

  const rsemMock: RSemProbeRepeatResult = {''',
    '''  assert.equal(protocolMock.failureDomain, "protocol");
  const passedMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 2,
    passed: true,
    validity: "valid",
    failureCategory: null,
    failureReason: null,
    executionStatus: "ok",
  }, "primary");
  const infrastructureMock = classifyP62MRepeat({
    taskId: "T-local-2",
    taskType: "local",
    repeat: 3,
    passed: false,
    validity: "infrastructure-invalid",
    failureCategory: "provider",
    failureReason: "mock provider outage",
    executionStatus: "provider-error",
  }, "primary");
  const denominatorSummary = summarizeP62M([passedMock, infrastructureMock]);
  assert.equal(denominatorSummary.primary.totalRepeats, 2);
  assert.equal(denominatorSummary.primary.scientificallyValidRepeats, 1);
  assert.equal(denominatorSummary.primary.infrastructureInvalidRepeats, 1);
  assert.equal(denominatorSummary.primary.passRate, 1);

  const rsemMock: RSemProbeRepeatResult = {'''
)

replace_once(
    verify,
    '''  const rsemMock: RSemProbeRepeatResult = {
    repeat: 1,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    booleanCorrect: 11,
    booleanTotal: 12,
    booleanAccuracy: 11 / 12,
    probeDetails: [],
    actualModel: "gpt-5.6-luna-mock",
    usage: { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 },
    estimatedCostUsd: 0,
  };''',
    '''  const rsemMock: RSemProbeRepeatResult = {
    repeat: 1,
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    executionStatus: "ok",
    validity: "valid",
    failureDomain: "none",
    failureReason: null,
    rawResponse: "{}",
    modelProvenance: {
      provider: "openai",
      requestedModel: "gpt-5.6-luna",
      actualModel: "gpt-5.6-luna-mock",
      responseId: "resp_mock",
      responseStatus: "completed",
      reasoningEffort: "high",
      maxOutputTokens: 8000,
      requestTimeoutMs: 180000,
      maxRetries: 2,
      sdkVersion,
      providerErrorCode: null,
    },
    booleanCorrect: 11,
    booleanTotal: 12,
    booleanAccuracy: 11 / 12,
    probeDetails: [],
    actualModel: "gpt-5.6-luna-mock",
    usage: { input: 0, output: 0, cachedInput: 0, cacheWriteInput: 0, reasoningOutput: 0, total: 0 },
    estimatedCostUsd: 0,
  };'''
)

# Replace journal section with legacy reproducer + fixed coexisting topology.
regex_once(
    verify,
    r'''  // Atomic artifact journals can recover committed M / R\^sem repeats missing from result\.json\..*?  \} finally \{\n    fs\.rmSync\(temp, \{ recursive: true, force: true \}\);\n  \}''',
    '''  // Regression reproducer: the pre-fix co-located topology lets M recovery delete rsem/repeat-N.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "p6-af-baseline-"));
  try {
    const mJournalResult = {
      ...semanticMock,
      role: "primary" as const,
      modifiedPaths: [],
      workingNote: null,
      actualModel: "mock",
      usage: null,
      estimatedCostUsd: 0,
      visible: null,
      hidden: null,
      taskSpecific: null,
      protocolContractViolated: null,
    };
    const mArtifacts: RepeatArtifactBundle = {
      rawResponse: "mock",
      modifiedFiles: {},
      modelProvenance: { actualModel: "mock" },
      testResults: { mock: true },
      agentExecutionStatus: "ok",
      agentError: null,
      runnerError: null,
    };

    const legacyRoot = path.join(temp, "legacy-colocated");
    commitRepeatArtifactsAtomic(legacyRoot, mJournalResult, mArtifacts);
    commitProbeResultAtomic(legacyRoot, rsemMock);
    const legacyProbePath = path.join(legacyRoot, "rsem", "repeat-1", "probe_result.json");
    assert(fs.existsSync(legacyProbePath));
    reconcileRepeatJournal<typeof mJournalResult>(legacyRoot, []);
    assert(!fs.existsSync(legacyProbePath), "legacy co-located layout should reproduce Critical #1 deletion");

    // Fixed topology: M recovery is rooted at runDir/m and cannot traverse runDir/rsem.
    const fixedRoot = path.join(temp, "fixed-separated");
    const fixedMRoot = mJournalDirectory(fixedRoot);
    commitRepeatArtifactsAtomic(fixedMRoot, mJournalResult, mArtifacts);
    commitProbeResultAtomic(fixedRoot, rsemMock);
    const fixedProbePath = path.join(fixedRoot, "rsem", "repeat-1", "probe_result.json");
    const mRecovered = reconcileRepeatJournal<typeof mJournalResult>(fixedMRoot, []);
    assert.equal(mRecovered.recoveredArtifactKeys.length, 1);
    assert.equal(mRecovered.repeatResults[0].taskId, "T-local-2");
    assert(fs.existsSync(fixedProbePath), "M recovery must not delete the coexisting R^sem journal");
    const rRecovered = reconcileProbeJournal(fixedRoot, []);
    assert.deepEqual(rRecovered.recoveredArtifactRepeats, [1]);
    assert.equal(rRecovered.repeatResults[0].booleanAccuracy, 11 / 12);

    // R^sem failures are returned as journalable records; injected clients guarantee no live API call.
    const correctAnswers = Object.fromEntries(booleanProbes.map((probe) => [probe.probeId, String(probe.correctAnswer)]));
    const capturedClientOptions: Array<{ timeout: number; maxRetries: number }> = [];
    const success = await runRSemRepeat(
      repository,
      booleanProbes,
      2,
      fakeProbeFactory(completedProbeResponse(JSON.stringify(correctAnswers)), capturedClientOptions)
    );
    assert.equal(success.failureDomain, "none");
    assert.equal(success.booleanAccuracy, 1);
    assert.deepEqual(capturedClientOptions, [{ timeout: 180000, maxRetries: 2 }]);

    const refusalResponse = {
      ...completedProbeResponse(""),
      id: "resp_refusal",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "mock refusal" }] }],
    };
    const refusal = await runRSemRepeat(repository, booleanProbes, 3, fakeProbeFactory(refusalResponse));
    assert.equal(refusal.executionStatus, "response-refusal");
    assert.equal(refusal.failureDomain, "infrastructure");
    assert.equal(refusal.validity, "infrastructure-invalid");

    const incompleteResponse = {
      ...completedProbeResponse(""),
      id: "resp_incomplete",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    };
    const incomplete = await runRSemRepeat(repository, booleanProbes, 4, fakeProbeFactory(incompleteResponse));
    assert.equal(incomplete.executionStatus, "response-incomplete");
    assert.equal(incomplete.failureDomain, "infrastructure");

    const parseFailure = await runRSemRepeat(
      repository,
      booleanProbes,
      5,
      fakeProbeFactory(completedProbeResponse("not-json"))
    );
    assert.equal(parseFailure.executionStatus, "output-parse-failure");
    assert.equal(parseFailure.failureDomain, "protocol");
    assert.equal(parseFailure.validity, "valid");

    const apiError = Object.assign(new Error("mock API outage"), { code: "mock_provider_error" });
    const providerFailure = await runRSemRepeat(repository, booleanProbes, 6, fakeProbeFactory(apiError));
    assert.equal(providerFailure.executionStatus, "provider-error");
    assert.equal(providerFailure.failureDomain, "infrastructure");
    assert.equal(providerFailure.modelProvenance.providerErrorCode, "mock_provider_error");

    for (const failureResult of [refusal, incomplete, parseFailure, providerFailure]) {
      commitProbeResultAtomic(fixedRoot, failureResult);
    }
    const failureJournal = reconcileProbeJournal(fixedRoot, [rsemMock, refusal, incomplete, parseFailure, providerFailure]);
    assert.equal(failureJournal.missingArtifactRepeats.length, 0);
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "response-refusal" && item.failureDomain === "infrastructure"));
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "response-incomplete" && item.failureDomain === "infrastructure"));
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "output-parse-failure" && item.failureDomain === "protocol"));
    assert(failureJournal.repeatResults.some((item) => item.executionStatus === "provider-error" && item.failureDomain === "infrastructure"));

    const serializedPath = path.join(temp, "result.json");
    fs.writeFileSync(serializedPath, JSON.stringify(result, null, 2));
    const persisted = JSON.parse(fs.readFileSync(serializedPath, "utf8")) as P62AfBaselineResult;
    assert(Array.isArray(persisted.measurements.M.repeatResults));
    assert(Array.isArray(persisted.measurements.Rsem.repeatResults));
    assert.equal(persisted.measurements.M.repeatResults[0].failureDomain, "semantic");
    assert.equal(persisted.measurements.Rsem.repeatResults[0].designVersion, STAGE1_BOOLEAN_DESIGN_VERSION);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }'''
)

replace_once(
    verify,
    '''  console.log("  resume mismatch: rejected; M/Rsem journals: recovery verified; live API calls: 0");''',
    '''  console.log("  Critical #1 legacy topology reproducer: deletion confirmed; separated m/rsem topology: preserved");
  console.log("  R^sem failures: refusal/incomplete/parse/API error journalable via injected clients; live API calls: 0");
  console.log("  resume mismatch: rejected; M/Rsem journals: recovery verified; live API calls: 0");'''
)

print("P6-2 review fixes applied")
