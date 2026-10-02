import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertTrackedWorktreeClean } from "./task-bank-live-runtime";
import {
  assertNoUntrackedP63V3RuntimeRepositoryFiles,
  resolveP63V3RuntimeEnvironmentProvenance,
  type P63V3RuntimeEnvironmentProvenance,
} from "./p6-3-v3-runtime-environment";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVIDER_MAX_RETRIES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
  buildP63V3RSemReliabilityAuditPlan,
} from "./p6-3-v3-rsem-reliability-audit-spec";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION,
} from "./p6-3-v3-rsem-reliability-audit-executor";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_RUNNER_VERSION,
} from "./p6-3-v3-rsem-reliability-audit-runner";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION,
} from "./p6-3-v3-rsem-reliability-audit-controller";

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION =
  "p6-3-v3-rsem-reliability-audit-final-prelive-gate-v2" as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA =
  "p6-3-v3-rsem-reliability-audit-final-prelive-receipt-v2" as const;

const FINAL_PRELIVE_PASS_BRAND: unique symbol = Symbol(
  "p6-3-v3-rsem-reliability-audit-final-prelive-pass"
);

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS =
  Object.freeze([
    "verify-p6-3-v3-rsem-reliability-audit-core.ts",
  ] as const);

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_SOURCE_FILES =
  Object.freeze([
    "harness/package.json",
    "harness/package-lock.json",
    "harness/src/agent-backend/openai/shared.ts",
    "harness/src/context/fixed-environment-runtime.ts",
    "harness/src/context/generation-zero-fixed-environment.ts",
    "harness/src/context/p6-3-v3-final-static-exposure-selector.ts",
    "harness/src/context/p6-3-v3-static-exposure-runtime.ts",
    "harness/src/p6/p6-3-execution-protocol.ts",
    "harness/src/p6/p6-3-rsem-protocol-parity.ts",
    "harness/src/p6/p6-3-v3-calibration-predeclaration.ts",
    "harness/src/p6/p6-3-v3-calibration-runner.ts",
    "harness/src/p6/p6-3-v3-rsem-executor.ts",
    "harness/src/p6/p6-3-v3-run-start.ts",
    "harness/src/p6/p6-3-v3-runtime-environment.ts",
    "harness/src/p6/p6-3-v3-rsem-reliability-audit-spec.ts",
    "harness/src/p6/p6-3-v3-rsem-reliability-audit-executor.ts",
    "harness/src/p6/p6-3-v3-rsem-reliability-audit-runner.ts",
    "harness/src/p6/p6-3-v3-rsem-reliability-audit-controller.ts",
    "harness/src/p6/p6-3-v3-rsem-reliability-audit-final-prelive-gate.ts",
    "harness/src/p6/p6-3-v3-rsem-reliability-audit-live-entrypoint.ts",
    "harness/p6-3-v3-rsem-reliability-audit.ts",
  ] as const);

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_FROZEN_EVIDENCE_FILES =
  Object.freeze([
    "harness/frozen/p6-3-rsem-protocol-parity.json",
    "harness/frozen/p6-3-v3-rsem-reliability-audit.json",
  ] as const);

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_OPERATIONAL_EVIDENCE_FILES =
  Object.freeze([
    "docs/p6_3_v3_rsem_reliability_audit_predeclaration.md",
    "docs/p6_3_v3_rsem_reliability_audit_cost_estimate.md",
    "docs/findings/p6_3_v3_live_calibration_diagnostic_stop.md",
  ] as const);

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_INPUT_FILES =
  Object.freeze([
    "synthetic-world/ground_truth.json",
    "synthetic-world/naming_schemes.json",
    "calibration/fixtures/probe-bank-stage1.json",
  ] as const);

export interface P63V3RSemReliabilityAuditFinalPreLiveFileEvidence {
  readonly path: string;
  readonly sha256: string;
}

export interface P63V3RSemReliabilityAuditFinalPreLiveReceipt {
  readonly schemaVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA;
  readonly gateVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION;
  readonly checkoutGitSha: string;
  readonly runClass: "reliability-audit";
  readonly scientificPoolingAllowed: false;
  readonly confirmatoryStage1AEligible: false;
  readonly specVersion: typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION;
  readonly auditExecutorVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION;
  readonly auditRunnerVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_RUNNER_VERSION;
  readonly auditControllerVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION;
  readonly candidateCaps: readonly [32000, 64000];
  readonly hardAuditCap: 64000;
  readonly plannedValidTrialCeiling: 120;
  readonly providerAttemptCeiling: 360;
  readonly auditProviderMaxRetries: 0;
  readonly sdkAutomaticRetriesDisabled: true;
  readonly interruptedAttemptCostReservation: true;
  readonly usageLessAttemptCostReservation: true;
  readonly headroomDiagnosticsAffectQualification: false;
  readonly operationalCostCeilingUsd: 22;
  readonly preflightPassed: true;
  readonly exactCleanCheckoutVerified: true;
  readonly runtimeConsumedUntrackedFilesVerified: true;
  readonly runtimeEnvironment: Readonly<P63V3RuntimeEnvironmentProvenance>;
  readonly paidLiveAuthorizationRequired: true;
  readonly liveAuthorized: false;
  readonly providerCallsMade: false;
  readonly verifiers: readonly {
    readonly script: string;
    readonly status: "pass";
  }[];
  readonly sourceEvidence:
    readonly P63V3RSemReliabilityAuditFinalPreLiveFileEvidence[];
  readonly frozenEvidence:
    readonly P63V3RSemReliabilityAuditFinalPreLiveFileEvidence[];
  readonly operationalEvidence:
    readonly P63V3RSemReliabilityAuditFinalPreLiveFileEvidence[];
  readonly inputEvidence:
    readonly P63V3RSemReliabilityAuditFinalPreLiveFileEvidence[];
  readonly verifierEvidence:
    readonly P63V3RSemReliabilityAuditFinalPreLiveFileEvidence[];
}

export type P63V3RSemReliabilityAuditFinalPreLiveGatePassToken = Readonly<{
  receipt: P63V3RSemReliabilityAuditFinalPreLiveReceipt;
  [FINAL_PRELIVE_PASS_BRAND]: true;
}>;

export function runP63V3RSemReliabilityAuditFinalPreLiveGate(
  harnessRoot: string
): P63V3RSemReliabilityAuditFinalPreLiveGatePassToken {
  const repoRoot = path.resolve(harnessRoot, "..");
  assertTrackedWorktreeClean(repoRoot);
  assertNoUntrackedP63V3RuntimeRepositoryFiles(repoRoot);
  const checkoutGitSha = resolveCheckoutGitSha(repoRoot);
  const runtimeEnvironmentBefore =
    resolveP63V3RuntimeEnvironmentProvenance(harnessRoot);

  const plan = buildP63V3RSemReliabilityAuditPlan();
  if (
    plan.length !==
    P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS
  ) {
    throw new Error(
      `Rsem reliability audit final pre-live requires ${P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS} planned valid trials, got ${plan.length}`
    );
  }
  if (
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.candidateCaps[0] !== 32000 ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.candidateCaps[1] !== 64000 ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.hardAuditCap !== 64000 ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS !== 360 ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVIDER_MAX_RETRIES !== 0 ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT
      .headroomDiagnosticsAffectQualification !== false ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.operationalCost
      .unknownUsageAttemptPolicy !==
      "reserve-candidate-specific-projected-worst-case-cost" ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.operationalCost
      .interruptedAttemptPolicy !==
      "reserve-candidate-specific-projected-worst-case-cost" ||
    P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD !== 22
  ) {
    throw new Error("Rsem reliability audit final pre-live frozen envelope drifted");
  }

  const scratchRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "p6-3-v3-rsem-reliability-audit-prelive-")
  );
  try {
    const verifiers =
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS.map(
        (script) => {
          runVerifier(harnessRoot, scratchRoot, script);
          return Object.freeze({ script, status: "pass" as const });
        }
      );

    const sourceEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_SOURCE_FILES
    );
    const frozenEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_FROZEN_EVIDENCE_FILES
    );
    const operationalEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_OPERATIONAL_EVIDENCE_FILES
    );
    const inputEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_INPUT_FILES
    );
    const verifierEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS.map(
        (script) => `harness/${script}`
      )
    );

    assertTrackedWorktreeClean(repoRoot);
    assertNoUntrackedP63V3RuntimeRepositoryFiles(repoRoot);
    const checkoutAfter = resolveCheckoutGitSha(repoRoot);
    if (checkoutAfter !== checkoutGitSha) {
      throw new Error(
        `Rsem reliability audit checkout changed during final pre-live: ${checkoutGitSha} -> ${checkoutAfter}`
      );
    }

    const runtimeEnvironment =
      resolveP63V3RuntimeEnvironmentProvenance(harnessRoot);
    if (!sameRuntimeEnvironment(runtimeEnvironmentBefore, runtimeEnvironment)) {
      throw new Error(
        "Rsem reliability audit runtime dependency environment changed during final pre-live"
      );
    }

    const receipt: P63V3RSemReliabilityAuditFinalPreLiveReceipt =
      Object.freeze({
        schemaVersion:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA,
        gateVersion:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION,
        checkoutGitSha,
        runClass: "reliability-audit",
        scientificPoolingAllowed: false,
        confirmatoryStage1AEligible: false,
        specVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
        auditExecutorVersion:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION,
        auditRunnerVersion:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_RUNNER_VERSION,
        auditControllerVersion:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTROLLER_VERSION,
        candidateCaps:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.candidateCaps,
        hardAuditCap: 64000,
        plannedValidTrialCeiling:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS,
        providerAttemptCeiling:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS,
        auditProviderMaxRetries:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVIDER_MAX_RETRIES,
        sdkAutomaticRetriesDisabled: true,
        interruptedAttemptCostReservation: true,
        usageLessAttemptCostReservation: true,
        headroomDiagnosticsAffectQualification: false,
        operationalCostCeilingUsd:
          P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
        preflightPassed: true,
        exactCleanCheckoutVerified: true,
        runtimeConsumedUntrackedFilesVerified: true,
        runtimeEnvironment,
        paidLiveAuthorizationRequired: true,
        liveAuthorized: false,
        providerCallsMade: false,
        verifiers: Object.freeze(verifiers),
        sourceEvidence,
        frozenEvidence,
        operationalEvidence,
        inputEvidence,
        verifierEvidence,
      });
    return Object.freeze({
      receipt,
      [FINAL_PRELIVE_PASS_BRAND]: true as const,
    });
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
}

export function assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken(
  token: P63V3RSemReliabilityAuditFinalPreLiveGatePassToken
): void {
  if (!token || token[FINAL_PRELIVE_PASS_BRAND] !== true) {
    throw new Error("Rsem reliability audit requires a valid final pre-live token");
  }
  const receipt = token.receipt;
  if (
    receipt.schemaVersion !==
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA ||
    receipt.gateVersion !==
      P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION ||
    receipt.runClass !== "reliability-audit" ||
    receipt.scientificPoolingAllowed !== false ||
    receipt.confirmatoryStage1AEligible !== false ||
    receipt.specVersion !==
      P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION ||
    receipt.candidateCaps[0] !== 32000 ||
    receipt.candidateCaps[1] !== 64000 ||
    receipt.hardAuditCap !== 64000 ||
    receipt.plannedValidTrialCeiling !== 120 ||
    receipt.providerAttemptCeiling !== 360 ||
    receipt.auditProviderMaxRetries !== 0 ||
    receipt.sdkAutomaticRetriesDisabled !== true ||
    receipt.interruptedAttemptCostReservation !== true ||
    receipt.usageLessAttemptCostReservation !== true ||
    receipt.headroomDiagnosticsAffectQualification !== false ||
    receipt.operationalCostCeilingUsd !== 22 ||
    receipt.paidLiveAuthorizationRequired !== true ||
    receipt.liveAuthorized !== false ||
    receipt.providerCallsMade !== false ||
    receipt.preflightPassed !== true ||
    receipt.exactCleanCheckoutVerified !== true ||
    receipt.runtimeConsumedUntrackedFilesVerified !== true ||
    !/^[0-9a-f]{40}$/i.test(receipt.checkoutGitSha)
  ) {
    throw new Error("Rsem reliability audit final pre-live receipt contract mismatch");
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const harnessRoot = path.resolve(__dirname, "../..");
  assertTrackedWorktreeClean(repoRoot);
  assertNoUntrackedP63V3RuntimeRepositoryFiles(repoRoot);
  const currentCheckout = resolveCheckoutGitSha(repoRoot);
  if (currentCheckout !== receipt.checkoutGitSha) {
    throw new Error(
      `Rsem reliability audit final pre-live checkout drifted: ${receipt.checkoutGitSha} -> ${currentCheckout}`
    );
  }
  const currentRuntime =
    resolveP63V3RuntimeEnvironmentProvenance(harnessRoot);
  if (!sameRuntimeEnvironment(receipt.runtimeEnvironment, currentRuntime)) {
    throw new Error(
      "Rsem reliability audit final pre-live runtime environment drifted"
    );
  }
}

function offlineVerifierEnvironment(
  scratchRoot: string
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "P6_3_LIVE_EXECUTION_ALLOWED",
    "P6_3_V3_LIVE_EXECUTION_ALLOWED",
    "P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ALLOWED",
  ]) {
    delete env[key];
  }
  env.P6_3_LIVE_EXECUTION_ALLOWED = "0";
  env.P6_3_V3_LIVE_EXECUTION_ALLOWED = "0";
  env.P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ALLOWED = "0";
  env.P6_3_FREEZE_CANDIDATE_OUTPUT = path.join(
    scratchRoot,
    "freeze-candidate.json"
  );
  env.P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT = path.join(
    scratchRoot,
    "freeze-manifest.json"
  );
  return env;
}

function runVerifier(
  harnessRoot: string,
  scratchRoot: string,
  script: string
): void {
  const scriptPath = path.join(harnessRoot, script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `Rsem reliability audit final pre-live verifier missing: ${script}`
    );
  }
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
      `Rsem reliability audit verifier failed (${script}, exit=${String(result.status)})\n` +
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
    throw new Error(
      `Rsem reliability audit could not resolve checkout SHA: ${result.error?.message ?? result.stderr}`
    );
  }
  const sha = result.stdout.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`Rsem reliability audit invalid checkout SHA: ${sha}`);
  }
  return sha;
}

function inspectFiles(
  repoRoot: string,
  paths: readonly string[]
): readonly P63V3RSemReliabilityAuditFinalPreLiveFileEvidence[] {
  return Object.freeze(paths.map((item) => inspectFile(repoRoot, item)));
}

function inspectFile(
  repoRoot: string,
  repoRelativePath: string
): P63V3RSemReliabilityAuditFinalPreLiveFileEvidence {
  const absolute = path.join(repoRoot, repoRelativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(
      `Rsem reliability audit final pre-live evidence missing: ${repoRelativePath}`
    );
  }
  return Object.freeze({
    path: repoRelativePath,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(absolute))
      .digest("hex"),
  });
}

function sameRuntimeEnvironment(
  left: Readonly<P63V3RuntimeEnvironmentProvenance>,
  right: Readonly<P63V3RuntimeEnvironmentProvenance>
): boolean {
  return (
    left.version === right.version &&
    left.nodeVersion === right.nodeVersion &&
    left.openaiSdkVersion === right.openaiSdkVersion &&
    left.openaiSdkNodeEngine === right.openaiSdkNodeEngine &&
    left.packageLockSha256 === right.packageLockSha256
  );
}
