import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { assertTrackedWorktreeClean } from "./task-bank-live-runtime";
import {
  assertP63V2FinalPreLiveGatePassToken,
  runP63V2FinalPreLiveGate,
  type P63V2FinalPreLiveGatePassToken,
  type P63V2FinalPreLiveReceipt,
} from "./p6-3-v2-final-prelive-gate";

export const P6_3_V2_PAID_LIVE_GATE_VERSION =
  "p6-3-v2-paid-live-gate-v1" as const;
export const P6_3_V2_PAID_LIVE_SPEC_SCHEMA =
  "p6-3-v2-paid-live-wiring-spec-v1" as const;
export const P6_3_V2_PAID_LIVE_RECEIPT_SCHEMA =
  "p6-3-v2-paid-live-wiring-receipt-v1" as const;

const PAID_LIVE_PASS_BRAND: unique symbol = Symbol("p6-3-v2-paid-live-pass");

export const P6_3_V2_PAID_LIVE_SOURCE_FILES = Object.freeze([
  "harness/p6-3-v2-calibration.ts",
  "harness/src/p6/p6-3-v2-cli-preflight.ts",
  "harness/src/p6/p6-3-v2-final-prelive-gate.ts",
  "harness/src/p6/p6-3-v2-paid-live-gate.ts",
  "harness/src/p6/p6-3-v2-live-entrypoint.ts",
  "harness/src/p6/p6-3-v2-end-to-end.ts",
  "harness/src/p6/p6-3-v2-frozen-input-resolver.ts",
  "harness/src/p6/p6-3-v2-live-executors.ts",
  "harness/src/p6/p6-3-v2-live-calibration-runner.ts",
  "harness/src/p6/p6-3-v2-secondary-reliability.ts",
  "harness/src/p6/p6-3-v2-execution-parameters.ts",
] as const);

export const P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS = Object.freeze([
  "verify-p6-3-v2-live-wiring.ts",
] as const);

export const P6_3_V2_PAID_LIVE_OPERATIONAL_EVIDENCE_FILES = Object.freeze([
  "docs/p6_3_v2_paid_live_wiring.md",
] as const);

export interface P63V2PaidLiveFileEvidence {
  readonly path: string;
  readonly sha256: string;
}

export interface P63V2PaidLiveReceipt {
  readonly schemaVersion: typeof P6_3_V2_PAID_LIVE_RECEIPT_SCHEMA;
  readonly gateVersion: typeof P6_3_V2_PAID_LIVE_GATE_VERSION;
  readonly checkoutGitSha: string;
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly totalLogicalCells: 864;
  readonly paidLiveAuthorizationRequired: true;
  readonly liveExecutionWired: true;
  readonly liveAuthorized: false;
  readonly providerCallsMade: false;
  readonly baseFinalPreLiveReceipt: P63V2FinalPreLiveReceipt;
  readonly verifiers: readonly {
    readonly script: string;
    readonly status: "pass";
  }[];
  readonly wiringSpec: P63V2PaidLiveFileEvidence;
  readonly sourceEvidence: readonly P63V2PaidLiveFileEvidence[];
  readonly verifierEvidence: readonly P63V2PaidLiveFileEvidence[];
  readonly operationalEvidence: readonly P63V2PaidLiveFileEvidence[];
}

export type P63V2PaidLiveGatePassToken = Readonly<{
  receipt: P63V2PaidLiveReceipt;
  baseToken: P63V2FinalPreLiveGatePassToken;
  [PAID_LIVE_PASS_BRAND]: true;
}>;

interface PaidLiveSpec {
  schemaVersion: string;
  status: string;
  calibrationOnly: boolean;
  confirmatoryStage1AEligible: boolean;
  totalLogicalCells: number;
  paidLiveAuthorizationRequired: boolean;
  liveExecutionWired: boolean;
  liveExecutionAuthorized: boolean;
  authorizationFlag: string;
  authorizationEnvironment: string;
  baseFinalPreLiveSpec: string;
  sourceFiles: string[];
  verifierScripts: string[];
  operationalEvidenceFiles: string[];
}

export function runP63V2PaidLiveGate(
  harnessRoot: string
): P63V2PaidLiveGatePassToken {
  const repoRoot = path.resolve(harnessRoot, "..");
  assertTrackedWorktreeClean(repoRoot);

  // The existing final offline gate remains the base layer and is rerun against
  // the exact checkout that would later execute provider calls.
  const baseToken = runP63V2FinalPreLiveGate(harnessRoot);
  assertP63V2FinalPreLiveGatePassToken(baseToken);
  const checkoutGitSha = baseToken.receipt.checkoutGitSha;

  const spec = readAndValidateSpec(repoRoot);
  if (spec.baseFinalPreLiveSpec !== "harness/frozen/p6-3-v2-final-prelive-spec.json") {
    throw new Error("P6-3 v2 paid/live spec base final-prelive path mismatch");
  }

  const verifiers = P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS.map((script) => {
    runVerifier(harnessRoot, script);
    return Object.freeze({ script, status: "pass" as const });
  });

  assertTrackedWorktreeClean(repoRoot);
  const checkoutAfter = resolveCheckoutGitSha(repoRoot);
  if (checkoutAfter !== checkoutGitSha) {
    throw new Error(
      `P6-3 v2 paid/live checkout changed during verification: ${checkoutGitSha} -> ${checkoutAfter}`
    );
  }

  const receipt: P63V2PaidLiveReceipt = Object.freeze({
    schemaVersion: P6_3_V2_PAID_LIVE_RECEIPT_SCHEMA,
    gateVersion: P6_3_V2_PAID_LIVE_GATE_VERSION,
    checkoutGitSha,
    calibrationOnly: true,
    confirmatoryStage1AEligible: false,
    totalLogicalCells: 864,
    paidLiveAuthorizationRequired: true,
    liveExecutionWired: true,
    liveAuthorized: false,
    providerCallsMade: false,
    baseFinalPreLiveReceipt: baseToken.receipt,
    verifiers: Object.freeze(verifiers),
    wiringSpec: inspectFile(
      repoRoot,
      "harness/frozen/p6-3-v2-paid-live-wiring-spec.json"
    ),
    sourceEvidence: inspectFiles(repoRoot, P6_3_V2_PAID_LIVE_SOURCE_FILES),
    verifierEvidence: inspectFiles(
      repoRoot,
      P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS.map((script) => `harness/${script}`)
    ),
    operationalEvidence: inspectFiles(
      repoRoot,
      P6_3_V2_PAID_LIVE_OPERATIONAL_EVIDENCE_FILES
    ),
  });

  return Object.freeze({
    receipt,
    baseToken,
    [PAID_LIVE_PASS_BRAND]: true as const,
  });
}

export function assertP63V2PaidLiveGatePassToken(
  token: P63V2PaidLiveGatePassToken
): asserts token is P63V2PaidLiveGatePassToken {
  if (!token || token[PAID_LIVE_PASS_BRAND] !== true) {
    throw new Error("P6-3 v2 requires a valid paid/live wiring gate pass token");
  }
  assertP63V2FinalPreLiveGatePassToken(token.baseToken);
  if (
    token.receipt.checkoutGitSha !== token.baseToken.receipt.checkoutGitSha ||
    token.receipt.liveExecutionWired !== true ||
    token.receipt.paidLiveAuthorizationRequired !== true ||
    token.receipt.liveAuthorized !== false ||
    token.receipt.providerCallsMade !== false
  ) {
    throw new Error("P6-3 v2 paid/live wiring receipt violates the fail-closed contract");
  }
}

function readAndValidateSpec(repoRoot: string): PaidLiveSpec {
  const specPath = path.join(
    repoRoot,
    "harness/frozen/p6-3-v2-paid-live-wiring-spec.json"
  );
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as PaidLiveSpec;
  if (spec.schemaVersion !== P6_3_V2_PAID_LIVE_SPEC_SCHEMA) {
    throw new Error("P6-3 v2 paid/live wiring spec schema mismatch");
  }
  if (
    spec.status !== "paid-live-wiring-frozen" ||
    spec.calibrationOnly !== true ||
    spec.confirmatoryStage1AEligible !== false ||
    spec.totalLogicalCells !== 864 ||
    spec.paidLiveAuthorizationRequired !== true ||
    spec.liveExecutionWired !== true ||
    spec.liveExecutionAuthorized !== false ||
    spec.authorizationFlag !== "--authorize-paid-live=P6-3-v2" ||
    spec.authorizationEnvironment !== "P6_3_LIVE_EXECUTION_ALLOWED=1"
  ) {
    throw new Error("P6-3 v2 paid/live wiring spec core contract mismatch");
  }
  assertStableEqual(spec.sourceFiles, P6_3_V2_PAID_LIVE_SOURCE_FILES, "source files");
  assertStableEqual(
    spec.verifierScripts,
    P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS,
    "verifier scripts"
  );
  assertStableEqual(
    spec.operationalEvidenceFiles,
    P6_3_V2_PAID_LIVE_OPERATIONAL_EVIDENCE_FILES,
    "operational evidence"
  );
  return spec;
}

function runVerifier(harnessRoot: string, script: string): void {
  const scriptPath = path.join(harnessRoot, script);
  const result = spawnSync(
    process.execPath,
    ["-r", require.resolve("ts-node/register"), scriptPath],
    {
      cwd: harnessRoot,
      encoding: "utf8",
      env: offlineVerifierEnvironment(),
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `P6-3 v2 paid/live verifier failed (${script}, exit=${String(result.status)}): ` +
      `${result.error?.message ?? result.stderr ?? result.stdout}`
    );
  }
}

function offlineVerifierEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
  ]) {
    delete env[key];
  }
  env.P6_3_LIVE_EXECUTION_ALLOWED = "0";
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
      `P6-3 v2 paid/live gate could not resolve checkout SHA: ` +
      `${result.error?.message ?? result.stderr ?? `exit=${String(result.status)}`}`
    );
  }
  const sha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`P6-3 v2 paid/live gate received invalid checkout SHA: ${sha}`);
  }
  return sha;
}

function inspectFile(repoRoot: string, repoRelativePath: string): P63V2PaidLiveFileEvidence {
  const absolutePath = path.join(repoRoot, repoRelativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`P6-3 v2 paid/live evidence file missing: ${repoRelativePath}`);
  }
  return Object.freeze({
    path: repoRelativePath,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex"),
  });
}

function inspectFiles(
  repoRoot: string,
  paths: readonly string[]
): readonly P63V2PaidLiveFileEvidence[] {
  return Object.freeze(paths.map((item) => inspectFile(repoRoot, item)));
}

function assertStableEqual(actual: unknown, expected: unknown, label: string): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`P6-3 v2 paid/live ${label} mismatch`);
  }
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
