import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertTrackedWorktreeClean } from "./task-bank-live-runtime";

export const P6_3_UNIFIED_PRELIVE_GATE_VERSION =
  "p6-3-unified-prelive-gate-v1" as const;

const PRELIVE_PASS_BRAND: unique symbol = Symbol("p6-3-prelive-pass");

export type P63FrozenManifestStatus = "frozen-pass" | "frozen-pre-live";

export const P6_3_PRELIVE_MANIFEST_SPECS = Object.freeze([
  Object.freeze({
    key: "structuralFreeze" as const,
    path: "frozen/p6-3-el-structural-freeze.json",
    expectedStatus: "frozen-pass" as const,
  }),
  Object.freeze({
    key: "executionProtocol" as const,
    path: "frozen/p6-3-execution-protocol.json",
    expectedStatus: "frozen-pre-live" as const,
  }),
  Object.freeze({
    key: "mutationParity" as const,
    path: "frozen/p6-3-mutation-protocol-parity.json",
    expectedStatus: "frozen-pass" as const,
  }),
  Object.freeze({
    key: "rsemParity" as const,
    path: "frozen/p6-3-rsem-protocol-parity.json",
    expectedStatus: "frozen-pass" as const,
  }),
] as const);

export const P6_3_PRELIVE_VERIFIER_SCRIPTS = Object.freeze([
  "verify-p6-3-el-structural-freeze.ts",
  "verify-p6-3-structural-invariant-hardening.ts",
  "verify-p6-3-el-structural-freeze-manifest.ts",
  "verify-p6-3-execution-protocol.ts",
  "verify-p6-3-p62-critical-source-fingerprint.ts",
  "verify-p6-3-mutation-protocol-parity.ts",
  "verify-p6-3-rsem-protocol-parity.ts",
  "verify-p6-3-rsem-leak-proofing.ts",
] as const);

export interface P63FrozenManifestEvidence {
  readonly path: string;
  readonly status: P63FrozenManifestStatus;
  readonly schemaVersion: string;
  readonly sha256: string;
}

export interface P63UnifiedPreLiveReceipt {
  readonly schemaVersion: "p6-3-unified-prelive-receipt-v1";
  readonly gateVersion: typeof P6_3_UNIFIED_PRELIVE_GATE_VERSION;
  readonly checkoutGitSha: string;
  readonly preflightPassed: true;
  readonly liveAuthorized: false;
  readonly verifiers: readonly {
    readonly script: string;
    readonly status: "pass";
  }[];
  readonly manifests: Readonly<Record<
    (typeof P6_3_PRELIVE_MANIFEST_SPECS)[number]["key"],
    P63FrozenManifestEvidence
  >>;
}

export type P63PreLiveGatePassToken = Readonly<{
  receipt: P63UnifiedPreLiveReceipt;
  [PRELIVE_PASS_BRAND]: true;
}>;

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function runVerifier(harnessRoot: string, scratchRoot: string, script: string): void {
  const scriptPath = path.join(harnessRoot, script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`P6-3 pre-live verifier missing: ${script}`);
  }

  const result = spawnSync(
    process.execPath,
    ["-r", require.resolve("ts-node/register"), scriptPath],
    {
      cwd: harnessRoot,
      encoding: "utf8",
      env: offlineVerifierEnvironment(scratchRoot),
      maxBuffer: 16 * 1024 * 1024,
    }
  );

  if (result.error) {
    throw new Error(`P6-3 pre-live verifier could not start (${script}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stdout = (result.stdout ?? "").slice(-8000);
    const stderr = (result.stderr ?? "").slice(-8000);
    throw new Error(
      `P6-3 pre-live verifier failed (${script}, exit=${String(result.status)})\n` +
      `stdout:\n${stdout}\nstderr:\n${stderr}`
    );
  }
}

export function inspectP63FrozenManifests(
  harnessRoot: string
): P63UnifiedPreLiveReceipt["manifests"] {
  const entries = P6_3_PRELIVE_MANIFEST_SPECS.map((spec) => {
    const manifestPath = path.join(harnessRoot, spec.path);
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`P6-3 frozen manifest missing: ${spec.path}`);
    }
    const raw = fs.readFileSync(manifestPath);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      throw new Error(
        `P6-3 frozen manifest is not valid JSON (${spec.path}): ` +
        `${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`P6-3 frozen manifest must be an object: ${spec.path}`);
    }
    const record = parsed as Record<string, unknown>;
    if (record.status !== spec.expectedStatus) {
      throw new Error(
        `P6-3 frozen manifest has unexpected status (${spec.path}): ` +
        `expected=${spec.expectedStatus}, actual=${String(record.status)}`
      );
    }
    if (typeof record.schemaVersion !== "string" || record.schemaVersion.length === 0) {
      throw new Error(`P6-3 frozen manifest missing schemaVersion: ${spec.path}`);
    }
    const evidence: P63FrozenManifestEvidence = Object.freeze({
      path: spec.path,
      status: spec.expectedStatus,
      schemaVersion: record.schemaVersion,
      sha256: sha256(raw),
    });
    return [spec.key, evidence] as const;
  });

  return Object.freeze(Object.fromEntries(entries)) as P63UnifiedPreLiveReceipt["manifests"];
}

function resolveCheckoutGitSha(repoRoot: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineVerifierEnvironment(),
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `P6-3 pre-live gate could not resolve checkout git SHA: ` +
      `${result.error?.message ?? result.stderr ?? `exit=${String(result.status)}`}`
    );
  }
  const sha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(`P6-3 pre-live gate received invalid git SHA: ${sha}`);
  }
  return sha;
}

/**
 * Single offline fail-closed entry point for P6-3 live-runner integration.
 * It re-executes every frozen scientific verifier, then re-reads all four
 * frozen manifests from the same clean, stable checkout. It never authorizes
 * paid/live work.
 */
export function runP63UnifiedPreLiveGate(harnessRoot: string): P63PreLiveGatePassToken {
  const repoRoot = path.resolve(harnessRoot, "..");
  assertTrackedWorktreeClean(repoRoot);
  const checkoutGitSha = resolveCheckoutGitSha(repoRoot);
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-unified-prelive-"));
  try {
    const verifiers = P6_3_PRELIVE_VERIFIER_SCRIPTS.map((script) => {
      runVerifier(harnessRoot, scratchRoot, script);
      return Object.freeze({ script, status: "pass" as const });
    });

    assertTrackedWorktreeClean(repoRoot);
    const checkoutGitShaAfterVerification = resolveCheckoutGitSha(repoRoot);
    if (checkoutGitShaAfterVerification !== checkoutGitSha) {
      throw new Error(
        `P6-3 pre-live checkout changed during verification: ` +
        `${checkoutGitSha} -> ${checkoutGitShaAfterVerification}`
      );
    }

    const receipt: P63UnifiedPreLiveReceipt = Object.freeze({
      schemaVersion: "p6-3-unified-prelive-receipt-v1",
      gateVersion: P6_3_UNIFIED_PRELIVE_GATE_VERSION,
      checkoutGitSha,
      preflightPassed: true,
      liveAuthorized: false,
      verifiers: Object.freeze(verifiers),
      manifests: inspectP63FrozenManifests(harnessRoot),
    });

    return Object.freeze({
      receipt,
      [PRELIVE_PASS_BRAND]: true as const,
    });
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

/**
 * Future live code should require this branded token rather than a boolean.
 * Paid/live authorization remains a separate explicit gate.
 */
export function assertP63PreLiveGatePassToken(
  token: P63PreLiveGatePassToken
): asserts token is P63PreLiveGatePassToken {
  if (!token || token[PRELIVE_PASS_BRAND] !== true || token.receipt.preflightPassed !== true) {
    throw new Error("P6-3 live execution requires a valid unified pre-live gate pass token");
  }
  if (token.receipt.liveAuthorized !== false) {
    throw new Error("P6-3 pre-live receipt must not self-authorize live execution");
  }
}
