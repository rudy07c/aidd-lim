import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertTrackedWorktreeClean } from "./task-bank-live-runtime";
import {
  buildP63CalibrationPlan,
  P6_3_EXPECTED_NORMAL_CALL_COUNT,
  type P63FrozenBudgets,
} from "./p6-3-live-calibration-runner";

export const P6_3_V2_FINAL_PRELIVE_GATE_VERSION =
  "p6-3-v2-final-prelive-gate-v1" as const;
export const P6_3_V2_FINAL_PRELIVE_SPEC_SCHEMA =
  "p6-3-v2-final-prelive-spec-v1" as const;
export const P6_3_V2_FINAL_PRELIVE_RECEIPT_SCHEMA =
  "p6-3-v2-final-prelive-receipt-v1" as const;

const FINAL_PRELIVE_PASS_BRAND: unique symbol = Symbol("p6-3-v2-final-prelive-pass");

const EXPECTED_BUDGETS: P63FrozenBudgets = Object.freeze({
  B0: 0,
  B1: 505,
  B2: 1011,
  B3: 2023,
  B4: 3034,
  AF: 4046,
});

export const P6_3_V2_FINAL_FROZEN_EVIDENCE_FILES = Object.freeze([
  "harness/frozen/p6-3-el-structural-freeze.json",
  "harness/frozen/p6-3-execution-protocol.json",
  "harness/frozen/p6-3-mutation-protocol-parity.json",
  "harness/frozen/p6-3-rsem-protocol-parity.json",
  "harness/frozen/p6-3-v1-auto-infra-regression.json",
  "harness/frozen/p6-3-v2-execution-parameters.json",
] as const);

export const P6_3_V2_FINAL_SOURCE_FILES = Object.freeze([
  "harness/src/p6/p6-3-v2-auto-infra.ts",
  "harness/src/p6/p6-3-v2-execution-parameters.ts",
  "harness/src/p6/p6-3-v2-live-calibration-runner.ts",
  "harness/src/p6/p6-3-v2-secondary-reliability.ts",
  "harness/src/p6/p6-3-v2-live-executors.ts",
  "harness/src/p6/p6-3-v2-frozen-input-resolver.ts",
  "harness/src/p6/p6-3-v2-end-to-end.ts",
  "harness/src/p6/p6-3-v2-cli-preflight.ts",
  "harness/src/p6/p6-3-v2-final-prelive-gate.ts",
  "harness/p6-3-v2-calibration.ts",
] as const);

export const P6_3_V2_FINAL_VERIFIER_SCRIPTS = Object.freeze([
  "verify-p6-3-el-structural-freeze.ts",
  "verify-p6-3-structural-invariant-hardening.ts",
  "verify-p6-3-el-structural-freeze-manifest.ts",
  "verify-p6-3-execution-protocol.ts",
  "verify-p6-3-mutation-protocol-parity.ts",
  "verify-p6-3-rsem-protocol-parity.ts",
  "verify-p6-3-rsem-leak-proofing.ts",
  "verify-p6-3-v2-execution-parameters.ts",
  "verify-p6-3-v2-auto-infra-regression.ts",
  "verify-p6-3-v2-live-calibration-runner.ts",
  "verify-p6-3-v2-secondary-reliability.ts",
  "verify-p6-3-v2-live-executors.ts",
  "verify-p6-3-v2-frozen-input-resolver.ts",
  "verify-p6-3-v2-end-to-end.ts",
  "verify-p6-3-v2-cli-dry-gate.ts",
] as const);

export const P6_3_V2_FINAL_OPERATIONAL_EVIDENCE_FILES = Object.freeze([
  "docs/p6_3_cost_estimate.md",
  "docs/p6_3_v2_design_audit.md",
  "docs/p6_3_v2_end_to_end_wiring.md",
] as const);

export interface P63V2FinalPreLiveFileEvidence {
  readonly path: string;
  readonly sha256: string;
}

export interface P63V2FinalPreLiveReceipt {
  readonly schemaVersion: typeof P6_3_V2_FINAL_PRELIVE_RECEIPT_SCHEMA;
  readonly gateVersion: typeof P6_3_V2_FINAL_PRELIVE_GATE_VERSION;
  readonly checkoutGitSha: string;
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly totalLogicalCells: 864;
  readonly mutationMaxOutputTokens: 14000;
  readonly rsemMaxOutputTokens: 8000;
  readonly maxScientificAttemptsPerLogicalCell: 3;
  readonly preflightPassed: true;
  readonly finalPreLiveGateFrozen: true;
  readonly paidLiveAuthorizationRequired: true;
  readonly liveAuthorized: false;
  readonly providerCallsMade: false;
  readonly verifiers: readonly {
    readonly script: string;
    readonly status: "pass";
  }[];
  readonly finalSpec: P63V2FinalPreLiveFileEvidence;
  readonly frozenEvidence: readonly P63V2FinalPreLiveFileEvidence[];
  readonly sourceEvidence: readonly P63V2FinalPreLiveFileEvidence[];
  readonly verifierEvidence: readonly P63V2FinalPreLiveFileEvidence[];
  readonly operationalEvidence: readonly P63V2FinalPreLiveFileEvidence[];
}

export type P63V2FinalPreLiveGatePassToken = Readonly<{
  receipt: P63V2FinalPreLiveReceipt;
  [FINAL_PRELIVE_PASS_BRAND]: true;
}>;

interface FinalPreLiveSpec {
  schemaVersion: string;
  status: string;
  calibrationOnly: boolean;
  confirmatoryStage1AEligible: boolean;
  totalLogicalCells: number;
  mutationMaxOutputTokens: number;
  rsemMaxOutputTokens: number;
  maxScientificAttemptsPerLogicalCell: number;
  exactCheckoutShaBoundAtReceiptGeneration: boolean;
  paidLiveAuthorizationRequired: boolean;
  liveExecutionAuthorized: boolean;
  frozenEvidenceFiles: string[];
  sourceFiles: string[];
  verifierScripts: string[];
  operationalEvidenceFiles: string[];
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}

function assertStableEqual(actual: unknown, expected: unknown, label: string): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`P6-3 v2 final pre-live ${label} mismatch`);
  }
}

function offlineVerifierEnvironment(scratchRoot?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "P6_3_FREEZE_CANDIDATE_OUTPUT",
    "P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT",
    "P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT",
    "P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT",
    "P6_3_PRELIVE_RECEIPT_OUTPUT",
    "P6_3_V2_FINAL_PRELIVE_RECEIPT_OUTPUT",
  ]) {
    delete env[key];
  }
  env.P6_3_LIVE_EXECUTION_ALLOWED = "0";
  if (scratchRoot) {
    env.P6_3_FREEZE_CANDIDATE_OUTPUT = path.join(
      scratchRoot,
      "p6-3-el-structural-freeze-candidate.json"
    );
    env.P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT = path.join(
      scratchRoot,
      "p6-3-el-structural-freeze-expected-manifest.json"
    );
    env.P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT = path.join(
      scratchRoot,
      "p6-3-mutation-protocol-parity-expected.json"
    );
    env.P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT = path.join(
      scratchRoot,
      "p6-3-rsem-protocol-parity-expected.json"
    );
  }
  return env;
}

function resolveCheckoutGitSha(repoRoot: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineVerifierEnvironment(),
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `P6-3 v2 final pre-live gate could not resolve checkout SHA: ` +
      `${result.error?.message ?? result.stderr ?? `exit=${String(result.status)}`}`
    );
  }
  const sha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`P6-3 v2 final pre-live gate received invalid git SHA: ${sha}`);
  }
  return sha;
}

function readJson<T>(absolutePath: string, label: string): T {
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`P6-3 v2 final pre-live ${label} missing: ${absolutePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `P6-3 v2 final pre-live ${label} is invalid JSON: ` +
      `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function inspectFile(repoRoot: string, repoRelativePath: string): P63V2FinalPreLiveFileEvidence {
  const absolutePath = path.join(repoRoot, repoRelativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`P6-3 v2 final pre-live evidence file missing: ${repoRelativePath}`);
  }
  return Object.freeze({
    path: repoRelativePath,
    sha256: sha256(fs.readFileSync(absolutePath)),
  });
}

function inspectFiles(
  repoRoot: string,
  paths: readonly string[]
): readonly P63V2FinalPreLiveFileEvidence[] {
  return Object.freeze(paths.map((item) => inspectFile(repoRoot, item)));
}

function runVerifier(harnessRoot: string, scratchRoot: string, script: string): void {
  const scriptPath = path.join(harnessRoot, script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`P6-3 v2 final pre-live verifier missing: ${script}`);
  }
  const result = spawnSync(
    process.execPath,
    ["-r", require.resolve("ts-node/register"), scriptPath],
    {
      cwd: harnessRoot,
      encoding: "utf8",
      env: offlineVerifierEnvironment(scratchRoot),
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  if (result.error) {
    throw new Error(
      `P6-3 v2 final pre-live verifier could not start (${script}): ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `P6-3 v2 final pre-live verifier failed (${script}, exit=${String(result.status)})\n` +
      `stdout:\n${(result.stdout ?? "").slice(-12000)}\n` +
      `stderr:\n${(result.stderr ?? "").slice(-12000)}`
    );
  }
}

function validateFrozenInputs(repoRoot: string): void {
  const structural = readJson<any>(
    path.join(repoRoot, "harness/frozen/p6-3-el-structural-freeze.json"),
    "structural manifest"
  );
  const execution = readJson<any>(
    path.join(repoRoot, "harness/frozen/p6-3-v2-execution-parameters.json"),
    "v2 execution-parameter manifest"
  );

  if (structural.freezeCandidate?.T_EL !== 4046) {
    throw new Error("P6-3 v2 final pre-live structural T_EL mismatch");
  }
  if (structural.freezeCandidate?.staticExposureMaxTokensPerUnit !== 256) {
    throw new Error("P6-3 v2 final pre-live structural unit-size mismatch");
  }
  assertStableEqual(structural.freezeCandidate?.budgets, EXPECTED_BUDGETS, "structural budget grid");
  assertStableEqual(execution.structuralVariables?.budgets, EXPECTED_BUDGETS, "execution budget grid");
  if (execution.structuralVariables?.immutable !== true) {
    throw new Error("P6-3 v2 final pre-live structural immutability is not frozen");
  }
  if (execution.mutationProvider?.maxOutputTokens !== 14000) {
    throw new Error("P6-3 v2 final pre-live mutation maxOutputTokens mismatch");
  }
  if (execution.rsemProvider?.maxOutputTokens !== 8000) {
    throw new Error("P6-3 v2 final pre-live Rsem maxOutputTokens mismatch");
  }
  if (execution.executionPolicy?.maxScientificAttemptsPerLogicalCell !== 3) {
    throw new Error("P6-3 v2 final pre-live scientific attempt ceiling mismatch");
  }
  if (execution.liveExecutionAuthorized !== false) {
    throw new Error("P6-3 v2 execution-parameter manifest must not authorize live execution");
  }

  const plan = buildP63CalibrationPlan(EXPECTED_BUDGETS);
  if (plan.length !== P6_3_EXPECTED_NORMAL_CALL_COUNT || plan.length !== 864) {
    throw new Error(`P6-3 v2 final pre-live plan size mismatch: ${plan.length}`);
  }
}

function readAndValidateFinalSpec(repoRoot: string): FinalPreLiveSpec {
  const spec = readJson<FinalPreLiveSpec>(
    path.join(repoRoot, "harness/frozen/p6-3-v2-final-prelive-spec.json"),
    "final pre-live spec"
  );
  if (spec.schemaVersion !== P6_3_V2_FINAL_PRELIVE_SPEC_SCHEMA) {
    throw new Error("P6-3 v2 final pre-live spec schema mismatch");
  }
  if (spec.status !== "final-prelive-spec-frozen") {
    throw new Error("P6-3 v2 final pre-live spec status mismatch");
  }
  if (
    spec.calibrationOnly !== true ||
    spec.confirmatoryStage1AEligible !== false ||
    spec.totalLogicalCells !== 864 ||
    spec.mutationMaxOutputTokens !== 14000 ||
    spec.rsemMaxOutputTokens !== 8000 ||
    spec.maxScientificAttemptsPerLogicalCell !== 3 ||
    spec.exactCheckoutShaBoundAtReceiptGeneration !== true ||
    spec.paidLiveAuthorizationRequired !== true ||
    spec.liveExecutionAuthorized !== false
  ) {
    throw new Error("P6-3 v2 final pre-live spec core contract mismatch");
  }
  assertStableEqual(
    spec.frozenEvidenceFiles,
    P6_3_V2_FINAL_FROZEN_EVIDENCE_FILES,
    "frozen evidence list"
  );
  assertStableEqual(spec.sourceFiles, P6_3_V2_FINAL_SOURCE_FILES, "source evidence list");
  assertStableEqual(
    spec.verifierScripts,
    P6_3_V2_FINAL_VERIFIER_SCRIPTS,
    "verifier script list"
  );
  assertStableEqual(
    spec.operationalEvidenceFiles,
    P6_3_V2_FINAL_OPERATIONAL_EVIDENCE_FILES,
    "operational evidence list"
  );
  return spec;
}

/**
 * Final offline P6-3 v2 evidence binder. It proves the exact clean checkout,
 * hashes every frozen/runtime/verifier/operational surface declared in the
 * frozen final spec, and re-runs all scientific/reliability gates. It never
 * imports a provider executor and it always emits liveAuthorized=false.
 */
export function runP63V2FinalPreLiveGate(
  harnessRoot: string
): P63V2FinalPreLiveGatePassToken {
  const repoRoot = path.resolve(harnessRoot, "..");
  assertTrackedWorktreeClean(repoRoot);
  const checkoutGitSha = resolveCheckoutGitSha(repoRoot);
  readAndValidateFinalSpec(repoRoot);
  validateFrozenInputs(repoRoot);

  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-v2-final-prelive-"));
  try {
    const verifiers = P6_3_V2_FINAL_VERIFIER_SCRIPTS.map((script) => {
      runVerifier(harnessRoot, scratchRoot, script);
      return Object.freeze({ script, status: "pass" as const });
    });

    assertTrackedWorktreeClean(repoRoot);
    const checkoutGitShaAfterVerification = resolveCheckoutGitSha(repoRoot);
    if (checkoutGitShaAfterVerification !== checkoutGitSha) {
      throw new Error(
        `P6-3 v2 final pre-live checkout changed during verification: ` +
        `${checkoutGitSha} -> ${checkoutGitShaAfterVerification}`
      );
    }

    const receipt: P63V2FinalPreLiveReceipt = Object.freeze({
      schemaVersion: P6_3_V2_FINAL_PRELIVE_RECEIPT_SCHEMA,
      gateVersion: P6_3_V2_FINAL_PRELIVE_GATE_VERSION,
      checkoutGitSha,
      calibrationOnly: true,
      confirmatoryStage1AEligible: false,
      totalLogicalCells: 864,
      mutationMaxOutputTokens: 14000,
      rsemMaxOutputTokens: 8000,
      maxScientificAttemptsPerLogicalCell: 3,
      preflightPassed: true,
      finalPreLiveGateFrozen: true,
      paidLiveAuthorizationRequired: true,
      liveAuthorized: false,
      providerCallsMade: false,
      verifiers: Object.freeze(verifiers),
      finalSpec: inspectFile(repoRoot, "harness/frozen/p6-3-v2-final-prelive-spec.json"),
      frozenEvidence: inspectFiles(repoRoot, P6_3_V2_FINAL_FROZEN_EVIDENCE_FILES),
      sourceEvidence: inspectFiles(repoRoot, P6_3_V2_FINAL_SOURCE_FILES),
      verifierEvidence: inspectFiles(
        repoRoot,
        P6_3_V2_FINAL_VERIFIER_SCRIPTS.map((script) => `harness/${script}`)
      ),
      operationalEvidence: inspectFiles(
        repoRoot,
        P6_3_V2_FINAL_OPERATIONAL_EVIDENCE_FILES
      ),
    });

    return Object.freeze({
      receipt,
      [FINAL_PRELIVE_PASS_BRAND]: true as const,
    });
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

export function assertP63V2FinalPreLiveGatePassToken(
  token: P63V2FinalPreLiveGatePassToken
): asserts token is P63V2FinalPreLiveGatePassToken {
  if (
    !token ||
    token[FINAL_PRELIVE_PASS_BRAND] !== true ||
    token.receipt.preflightPassed !== true ||
    token.receipt.finalPreLiveGateFrozen !== true
  ) {
    throw new Error("P6-3 v2 requires a valid final pre-live gate pass token");
  }
  if (token.receipt.liveAuthorized !== false || token.receipt.providerCallsMade !== false) {
    throw new Error("P6-3 v2 final pre-live receipt must never self-authorize provider execution");
  }
}
