import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertTrackedWorktreeClean } from "./task-bank-live-runtime";
import { buildP63V3CalibrationPlan } from "./p6-3-v3-calibration-runner";
import { P6_3_V3_CALIBRATION_PREDECLARATION_VERSION } from "./p6-3-v3-calibration-predeclaration";
import { P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION } from "../context/p6-3-v3-final-static-exposure-selector";
import { P6_3_V3_LIVE_CONTROLLER_VERSION } from "./p6-3-v3-live-controller";

export const P6_3_V3_FINAL_PRELIVE_GATE_VERSION =
  "p6-3-v3-final-prelive-gate-v1" as const;
export const P6_3_V3_FINAL_PRELIVE_RECEIPT_SCHEMA =
  "p6-3-v3-final-prelive-receipt-v1" as const;

const FINAL_PRELIVE_PASS_BRAND: unique symbol = Symbol("p6-3-v3-final-prelive-pass");

export const P6_3_V3_FINAL_PRELIVE_VERIFIER_SCRIPTS = Object.freeze([
  "verify-p6-3-v3-fixed-protocol-spec.ts",
  "verify-p6-3-v3-generation-zero-fixed-environment.ts",
  "verify-p6-3-v3-m-executor.ts",
  "verify-p6-3-v3-rsem-executor.ts",
  "verify-p6-3-v3-run-start.ts",
  "verify-p6-3-v3-selector-structural-acceptance.ts",
  "verify-p6-3-v3-final-selector.ts",
  "verify-p6-3-v3-calibration-predeclaration.ts",
  "verify-p6-3-v3-calibration-runner.ts",
  "verify-p6-3-v3-live-controller.ts",
  "verify-p6-3-mutation-protocol-parity.ts",
  "verify-p6-3-rsem-protocol-parity.ts",
] as const);

export const P6_3_V3_FINAL_SOURCE_FILES = Object.freeze([
  "harness/src/context/fixed-world-protocol-spec.ts",
  "harness/src/context/generation-zero-fixed-environment.ts",
  "harness/src/context/fixed-environment-runtime.ts",
  "harness/src/context/p6-3-v3-selector-structural-acceptance.ts",
  "harness/src/context/p6-3-v3-final-static-exposure-selector.ts",
  "harness/src/context/p6-3-v3-static-exposure-runtime.ts",
  "harness/src/p6/p6-3-v3-m-executor.ts",
  "harness/src/p6/p6-3-v3-rsem-executor.ts",
  "harness/src/p6/p6-3-v3-run-start.ts",
  "harness/src/p6/p6-3-v3-calibration-predeclaration.ts",
  "harness/src/p6/p6-3-v3-calibration-runner.ts",
  "harness/src/p6/p6-3-v3-live-controller.ts",
  "harness/src/p6/p6-3-v3-final-prelive-gate.ts",
] as const);

export const P6_3_V3_FINAL_FROZEN_EVIDENCE_FILES = Object.freeze([
  "harness/frozen/p6-3-mutation-protocol-parity.json",
  "harness/frozen/p6-3-rsem-protocol-parity.json",
] as const);

export const P6_3_V3_FINAL_INPUT_FILES = Object.freeze([
  "synthetic-world/ground_truth.json",
  "synthetic-world/naming_schemes.json",
  "synthetic-world/heldout_tasks.json",
  "calibration/fixtures/probe-bank-stage1.json",
] as const);

export interface P63V3FinalPreLiveFileEvidence {
  readonly path: string;
  readonly sha256: string;
}

export interface P63V3FinalPreLiveReceipt {
  readonly schemaVersion: typeof P6_3_V3_FINAL_PRELIVE_RECEIPT_SCHEMA;
  readonly gateVersion: typeof P6_3_V3_FINAL_PRELIVE_GATE_VERSION;
  readonly checkoutGitSha: string;
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly totalLogicalCells: 864;
  readonly predeclarationVersion: typeof P6_3_V3_CALIBRATION_PREDECLARATION_VERSION;
  readonly finalSelectorVersion: typeof P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION;
  readonly liveControllerVersion: typeof P6_3_V3_LIVE_CONTROLLER_VERSION;
  readonly preflightPassed: true;
  readonly exactCleanCheckoutVerified: true;
  readonly paidLiveAuthorizationRequired: true;
  readonly liveAuthorized: false;
  readonly providerCallsMade: false;
  readonly verifiers: readonly { readonly script: string; readonly status: "pass" }[];
  readonly sourceEvidence: readonly P63V3FinalPreLiveFileEvidence[];
  readonly frozenEvidence: readonly P63V3FinalPreLiveFileEvidence[];
  readonly inputEvidence: readonly P63V3FinalPreLiveFileEvidence[];
  readonly verifierEvidence: readonly P63V3FinalPreLiveFileEvidence[];
}

export type P63V3FinalPreLiveGatePassToken = Readonly<{
  receipt: P63V3FinalPreLiveReceipt;
  [FINAL_PRELIVE_PASS_BRAND]: true;
}>;

export function runP63V3FinalPreLiveGate(
  harnessRoot: string
): P63V3FinalPreLiveGatePassToken {
  const repoRoot = path.resolve(harnessRoot, "..");
  assertTrackedWorktreeClean(repoRoot);
  const checkoutGitSha = resolveCheckoutGitSha(repoRoot);
  const plan = buildP63V3CalibrationPlan();
  if (plan.length !== 864) {
    throw new Error(`P6-3 v3 final pre-live requires 864 logical cells, got ${plan.length}`);
  }

  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-v3-final-prelive-"));
  try {
    const verifiers = P6_3_V3_FINAL_PRELIVE_VERIFIER_SCRIPTS.map((script) => {
      runVerifier(harnessRoot, scratchRoot, script);
      return Object.freeze({ script, status: "pass" as const });
    });
    const receipt: P63V3FinalPreLiveReceipt = Object.freeze({
      schemaVersion: P6_3_V3_FINAL_PRELIVE_RECEIPT_SCHEMA,
      gateVersion: P6_3_V3_FINAL_PRELIVE_GATE_VERSION,
      checkoutGitSha,
      calibrationOnly: true,
      confirmatoryStage1AEligible: false,
      totalLogicalCells: 864,
      predeclarationVersion: P6_3_V3_CALIBRATION_PREDECLARATION_VERSION,
      finalSelectorVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
      liveControllerVersion: P6_3_V3_LIVE_CONTROLLER_VERSION,
      preflightPassed: true,
      exactCleanCheckoutVerified: true,
      paidLiveAuthorizationRequired: true,
      liveAuthorized: false,
      providerCallsMade: false,
      verifiers: Object.freeze(verifiers),
      sourceEvidence: inspectFiles(repoRoot, P6_3_V3_FINAL_SOURCE_FILES),
      frozenEvidence: inspectFiles(repoRoot, P6_3_V3_FINAL_FROZEN_EVIDENCE_FILES),
      inputEvidence: inspectFiles(repoRoot, P6_3_V3_FINAL_INPUT_FILES),
      verifierEvidence: inspectFiles(
        repoRoot,
        P6_3_V3_FINAL_PRELIVE_VERIFIER_SCRIPTS.map((script) => `harness/${script}`)
      ),
    });
    return Object.freeze({ receipt, [FINAL_PRELIVE_PASS_BRAND]: true as const });
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

export function assertP63V3FinalPreLiveGatePassToken(
  token: P63V3FinalPreLiveGatePassToken
): void {
  if (!token || token[FINAL_PRELIVE_PASS_BRAND] !== true) {
    throw new Error("P6-3 v3 requires a valid final pre-live gate token");
  }
  const receipt = token.receipt;
  if (
    receipt.schemaVersion !== P6_3_V3_FINAL_PRELIVE_RECEIPT_SCHEMA ||
    receipt.gateVersion !== P6_3_V3_FINAL_PRELIVE_GATE_VERSION ||
    receipt.preflightPassed !== true ||
    receipt.exactCleanCheckoutVerified !== true ||
    receipt.calibrationOnly !== true ||
    receipt.confirmatoryStage1AEligible !== false ||
    receipt.totalLogicalCells !== 864 ||
    receipt.paidLiveAuthorizationRequired !== true ||
    receipt.liveAuthorized !== false ||
    receipt.providerCallsMade !== false ||
    !/^[0-9a-f]{40}$/i.test(receipt.checkoutGitSha)
  ) {
    throw new Error("P6-3 v3 final pre-live receipt contract mismatch");
  }
  if (receipt.verifiers.length !== P6_3_V3_FINAL_PRELIVE_VERIFIER_SCRIPTS.length) {
    throw new Error("P6-3 v3 final pre-live verifier receipt count mismatch");
  }
}

function offlineVerifierEnvironment(scratchRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "P6_3_LIVE_EXECUTION_ALLOWED",
    "P6_3_V3_LIVE_EXECUTION_ALLOWED",
    "P6_3_FREEZE_CANDIDATE_OUTPUT",
    "P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT",
    "P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT",
    "P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT",
  ]) delete env[key];
  env.P6_3_LIVE_EXECUTION_ALLOWED = "0";
  env.P6_3_V3_LIVE_EXECUTION_ALLOWED = "0";
  env.P6_3_FREEZE_CANDIDATE_OUTPUT = path.join(scratchRoot, "freeze-candidate.json");
  env.P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT = path.join(scratchRoot, "freeze-manifest.json");
  env.P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT = path.join(scratchRoot, "mutation-parity.json");
  env.P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT = path.join(scratchRoot, "rsem-parity.json");
  return env;
}

function runVerifier(harnessRoot: string, scratchRoot: string, script: string): void {
  const scriptPath = path.join(harnessRoot, script);
  if (!fs.existsSync(scriptPath)) throw new Error(`P6-3 v3 final pre-live verifier missing: ${script}`);
  const result = spawnSync(
    process.execPath,
    ["-r", require.resolve("ts-node/register"), scriptPath],
    {
      cwd: harnessRoot,
      encoding: "utf8",
      env: offlineVerifierEnvironment(scratchRoot),
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `P6-3 v3 final pre-live verifier failed (${script}, exit=${String(result.status)})\n` +
      `stdout:\n${(result.stdout ?? "").slice(-12000)}\n` +
      `stderr:\n${(result.stderr ?? result.error?.message ?? "").slice(-12000)}`
    );
  }
}

function resolveCheckoutGitSha(repoRoot: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`P6-3 v3 final pre-live could not resolve checkout SHA: ${result.error?.message ?? result.stderr}`);
  }
  const sha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`P6-3 v3 final pre-live invalid checkout SHA: ${sha}`);
  return sha.toLowerCase();
}

function inspectFiles(
  repoRoot: string,
  repoRelativePaths: readonly string[]
): readonly P63V3FinalPreLiveFileEvidence[] {
  return Object.freeze(repoRelativePaths.map((item) => inspectFile(repoRoot, item)));
}

function inspectFile(repoRoot: string, repoRelativePath: string): P63V3FinalPreLiveFileEvidence {
  const absolute = path.join(repoRoot, repoRelativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`P6-3 v3 final pre-live evidence file missing: ${repoRelativePath}`);
  }
  return Object.freeze({
    path: repoRelativePath,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"),
  });
}
