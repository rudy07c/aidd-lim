import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  assertTrackedWorktreeClean,
} from "./task-bank-live-runtime";
import {
  assertNoUntrackedP63V3RuntimeRepositoryFiles,
  resolveP63V3RuntimeEnvironmentProvenance,
  type P63V3RuntimeEnvironmentProvenance,
} from "./p6-3-v3-runtime-environment";
import {
  loadP63V3InheritedMEvidence,
} from "./p6-3-v3-inherited-m-evidence";
import {
  buildP63V3RSemCompletionPlan,
  p63V3RSemCompletionPlanHash,
} from "./p6-3-v3-rsem-completion-plan";
import {
  P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
} from "./p6-3-v3-rsem-completion-predeclaration";
import {
  P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
} from "./p6-3-v3-rsem-completion-executor";
import {
  P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION,
} from "./p6-3-v3-rsem-completion-runner";
import {
  P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION,
} from "./p6-3-v3-rsem-completion-controller";
import {
  P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION,
} from "./p6-3-v3-rsem-completion-finalizer";
export const P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_GATE_VERSION =
  "p6-3-v3-rsem-completion-final-prelive-gate-v1" as const;
export const P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_RECEIPT_SCHEMA =
  "p6-3-v3-rsem-completion-final-prelive-receipt-v1" as const;

const PASS_BRAND: unique symbol = Symbol(
  "p6-3-v3-rsem-completion-final-prelive-pass"
);

export const P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_VERIFIER_SCRIPTS =
  Object.freeze([
    "verify-package-version.ts",
    "verify-p6-3-v3-generation-zero-fixed-environment.ts",
    "verify-p6-3-v3-final-selector.ts",
    "verify-p6-3-rsem-protocol-parity.ts",
    "verify-p6-3-v3-rsem-executor.ts",
    "verify-p6-3-v3-rsem-completion-predeclaration.ts",
    "verify-p6-3-v3-rsem-completion-runtime.ts",
    "verify-p6-3-v3-rsem-completion-controller.ts",
    "verify-p6-3-v3-rsem-completion-finalizer.ts",
  ] as const);

export const P6_3_V3_RSEM_COMPLETION_FINAL_SOURCE_FILES =
  Object.freeze([
    "harness/package.json",
    "harness/package-lock.json",
    "harness/p6-af-baseline-live.ts",
    "harness/src/agent-backend/package-version.ts",
    "harness/src/agent-backend/openai/shared.ts",
    "harness/src/context/fixed-world-protocol-spec.ts",
    "harness/src/context/generation-zero-fixed-environment.ts",
    "harness/src/context/fixed-environment-runtime.ts",
    "harness/src/context/p6-3-v3-final-static-exposure-selector.ts",
    "harness/src/context/p6-3-v3-static-exposure-runtime.ts",
    "harness/src/p6/p6-3-execution-protocol.ts",
    "harness/src/p6/p6-3-rsem-protocol-parity.ts",
    "harness/src/p6/p6-3-v3-calibration-predeclaration.ts",
    "harness/src/p6/p6-3-v3-calibration-runner.ts",
    "harness/src/p6/p6-3-v3-scientific-validity.ts",
    "harness/src/p6/p6-3-v3-rsem-executor.ts",
    "harness/src/p6/p6-3-v3-run-start.ts",
    "harness/src/p6/p6-3-v3-inherited-m-evidence.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-predeclaration.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-plan.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-executor.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-runner.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-controller.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-finalizer.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-entrypoint.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-final-prelive-gate.ts",
    "harness/src/p6/p6-3-v3-runtime-environment.ts",
    "harness/p6-3-v3-rsem-completion.ts",
    "harness/p6-3-v3-rsem-completion-finalize.ts",
    "calibration/src/probe-generator.ts",
    "calibration/src/probe-scorer.ts",
    "calibration/src/stage1-probes.ts",
  ] as const);

export const P6_3_V3_RSEM_COMPLETION_FINAL_FROZEN_EVIDENCE_FILES =
  Object.freeze([
    "harness/frozen/p6-3-rsem-protocol-parity.json",
    "harness/frozen/p6-3-v3-rsem-completion.json",
    "docs/findings/evidence/p6-3-v3-live-diagnostic-stop/state.json",
    "docs/findings/p6_3_v3_rsem_reliability_audit.md",
  ] as const);

export const P6_3_V3_RSEM_COMPLETION_FINAL_INPUT_FILES =
  Object.freeze([
    "synthetic-world/ground_truth.json",
    "synthetic-world/naming_schemes.json",
    "calibration/fixtures/probe-bank-stage1.json",
  ] as const);

export interface P63V3RSemCompletionFinalPreLiveFileEvidence {
  readonly path: string;
  readonly sha256: string;
}

export interface P63V3RSemCompletionFinalPreLiveReceipt {
  readonly schemaVersion:
    typeof P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_RECEIPT_SCHEMA;
  readonly gateVersion:
    typeof P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_GATE_VERSION;
  readonly checkoutGitSha: string;
  readonly runClass: "scientific-calibration-completion";
  readonly calibrationOnly: true;
  readonly confirmatoryStage1AEligible: false;
  readonly freshRSemLogicalCells: 72;
  readonly combinedAnalysisLogicalCells: 864;
  readonly inheritedMLogicalCells: 792;
  readonly inheritedMSourceStateSha256: string;
  readonly inheritedMSemanticSha256: string;
  readonly freshRSemPlanSha256: string;
  readonly fixedEnvironmentIdentity: string;
  readonly providerMaxOutputTokens: number;
  readonly providerMaxRetries: number;
  readonly predeclarationVersion:
    typeof P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION;
  readonly executorVersion:
    typeof P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION;
  readonly runnerVersion:
    typeof P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION;
  readonly controllerVersion:
    typeof P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION;
  readonly finalizerVersion:
    typeof P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION;
  readonly preflightPassed: true;
  readonly exactCleanCheckoutVerified: true;
  readonly runtimeConsumedUntrackedFilesVerified: true;
  readonly runtimeEnvironment:
    Readonly<P63V3RuntimeEnvironmentProvenance>;
  readonly paidLiveAuthorizationRequired: true;
  readonly liveAuthorized: false;
  readonly providerCallsMade: false;
  readonly verifiers:
    readonly {
      readonly script: string;
      readonly status: "pass";
    }[];
  readonly sourceEvidence:
    readonly P63V3RSemCompletionFinalPreLiveFileEvidence[];
  readonly frozenEvidence:
    readonly P63V3RSemCompletionFinalPreLiveFileEvidence[];
  readonly inputEvidence:
    readonly P63V3RSemCompletionFinalPreLiveFileEvidence[];
  readonly verifierEvidence:
    readonly P63V3RSemCompletionFinalPreLiveFileEvidence[];
}

export type P63V3RSemCompletionFinalPreLiveGatePassToken =
  Readonly<{
    receipt:
      P63V3RSemCompletionFinalPreLiveReceipt;
    [PASS_BRAND]: true;
  }>;

export function runP63V3RSemCompletionFinalPreLiveGate(
  harnessRoot: string
): P63V3RSemCompletionFinalPreLiveGatePassToken {
  const repoRoot = path.resolve(
    harnessRoot,
    ".."
  );
  assertTrackedWorktreeClean(repoRoot);
  assertNoUntrackedP63V3RuntimeRepositoryFiles(
    repoRoot
  );

  const checkoutGitSha =
    resolveCheckoutGitSha(repoRoot);
  const runtimeEnvironmentBefore =
    resolveP63V3RuntimeEnvironmentProvenance(
      harnessRoot
    );

  const plan =
    buildP63V3RSemCompletionPlan();
  const planHash =
    p63V3RSemCompletionPlanHash(plan);
  if (
    plan.length !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS ||
    planHash !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion final pre-live fresh plan mismatch"
    );
  }

  const inherited =
    loadP63V3InheritedMEvidence(repoRoot);
  if (
    inherited.validMLogicalCells !==
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS ||
    inherited.sourceStateSha256 !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256 ||
    inherited.mEvidenceSemanticSha256 !==
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256 ||
    inherited.fixedEnvironmentIdentity !==
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion final pre-live inherited M binding mismatch"
    );
  }

  const scratchRoot = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "p6-3-v3-rsem-completion-final-prelive-"
    )
  );
  try {
    const verifiers =
      P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_VERIFIER_SCRIPTS.map(
        (script) => {
          runVerifier(
            harnessRoot,
            scratchRoot,
            script
          );
          return Object.freeze({
            script,
            status: "pass" as const,
          });
        }
      );

    const sourceEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_COMPLETION_FINAL_SOURCE_FILES
    );
    const frozenEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_COMPLETION_FINAL_FROZEN_EVIDENCE_FILES
    );
    const inputEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_COMPLETION_FINAL_INPUT_FILES
    );
    const verifierEvidence = inspectFiles(
      repoRoot,
      P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_VERIFIER_SCRIPTS.map(
        (script) => `harness/${script}`
      )
    );

    assertTrackedWorktreeClean(repoRoot);
    assertNoUntrackedP63V3RuntimeRepositoryFiles(
      repoRoot
    );
    const checkoutAfter =
      resolveCheckoutGitSha(repoRoot);
    if (checkoutAfter !== checkoutGitSha) {
      throw new Error(
        `P6-3 v3 Rsem completion checkout changed during final pre-live verification: ${checkoutGitSha} -> ${checkoutAfter}`
      );
    }
    const runtimeEnvironment =
      resolveP63V3RuntimeEnvironmentProvenance(
        harnessRoot
      );
    if (
      !sameRuntimeEnvironment(
        runtimeEnvironmentBefore,
        runtimeEnvironment
      )
    ) {
      throw new Error(
        "P6-3 v3 Rsem completion runtime dependency environment changed during final pre-live verification"
      );
    }

    const receipt:
      P63V3RSemCompletionFinalPreLiveReceipt =
      Object.freeze({
        schemaVersion:
          P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_RECEIPT_SCHEMA,
        gateVersion:
          P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_GATE_VERSION,
        checkoutGitSha,
        runClass:
          "scientific-calibration-completion",
        calibrationOnly: true,
        confirmatoryStage1AEligible: false,
        freshRSemLogicalCells:
          P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
        combinedAnalysisLogicalCells:
          P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
        inheritedMLogicalCells:
          P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
        inheritedMSourceStateSha256:
          inherited.sourceStateSha256,
        inheritedMSemanticSha256:
          inherited.mEvidenceSemanticSha256,
        freshRSemPlanSha256:
          planHash,
        fixedEnvironmentIdentity:
          inherited.fixedEnvironmentIdentity,
        providerMaxOutputTokens:
          P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
        providerMaxRetries:
          P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
        predeclarationVersion:
          P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
        executorVersion:
          P6_3_V3_RSEM_COMPLETION_EXECUTOR_VERSION,
        runnerVersion:
          P6_3_V3_RSEM_COMPLETION_RUNNER_VERSION,
        controllerVersion:
          P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION,
        finalizerVersion:
          P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION,
        preflightPassed: true,
        exactCleanCheckoutVerified: true,
        runtimeConsumedUntrackedFilesVerified:
          true,
        runtimeEnvironment,
        paidLiveAuthorizationRequired: true,
        liveAuthorized: false,
        providerCallsMade: false,
        verifiers: Object.freeze(verifiers),
        sourceEvidence,
        frozenEvidence,
        inputEvidence,
        verifierEvidence,
      });
    return Object.freeze({
      receipt,
      [PASS_BRAND]: true as const,
    });
  } finally {
    fs.rmSync(scratchRoot, {
      recursive: true,
      force: true,
    });
  }
}

export function assertP63V3RSemCompletionFinalPreLiveGatePassToken(
  token:
    P63V3RSemCompletionFinalPreLiveGatePassToken
): void {
  if (
    !token ||
    token[PASS_BRAND] !== true
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion requires a valid final pre-live gate token"
    );
  }
  const receipt = token.receipt;
  if (
    receipt.schemaVersion !==
      P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_RECEIPT_SCHEMA ||
    receipt.gateVersion !==
      P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_GATE_VERSION ||
    receipt.runClass !==
      "scientific-calibration-completion" ||
    receipt.calibrationOnly !== true ||
    receipt.confirmatoryStage1AEligible !==
      false ||
    receipt.freshRSemLogicalCells !== 72 ||
    receipt.combinedAnalysisLogicalCells !==
      864 ||
    receipt.inheritedMLogicalCells !== 792 ||
    receipt.inheritedMSourceStateSha256 !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256 ||
    receipt.inheritedMSemanticSha256 !==
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256 ||
    receipt.freshRSemPlanSha256 !==
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256 ||
    receipt.fixedEnvironmentIdentity !==
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY ||
    receipt.providerMaxOutputTokens !==
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens ||
    receipt.providerMaxRetries !==
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries ||
    receipt.controllerVersion !==
      P6_3_V3_RSEM_COMPLETION_CONTROLLER_VERSION ||
    receipt.finalizerVersion !==
      P6_3_V3_RSEM_COMPLETION_FINALIZER_VERSION ||
    receipt.preflightPassed !== true ||
    receipt.exactCleanCheckoutVerified !==
      true ||
    receipt.runtimeConsumedUntrackedFilesVerified !==
      true ||
    receipt.paidLiveAuthorizationRequired !==
      true ||
    receipt.liveAuthorized !== false ||
    receipt.providerCallsMade !== false ||
    !/^[0-9a-f]{40}$/i.test(
      receipt.checkoutGitSha
    )
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion final pre-live receipt contract mismatch"
    );
  }
  if (
    receipt.verifiers.length !==
    P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_VERIFIER_SCRIPTS.length
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion final pre-live verifier receipt count mismatch"
    );
  }

  const repoRoot = path.resolve(
    __dirname,
    "../../.."
  );
  const harnessRoot = path.resolve(
    __dirname,
    "../.."
  );
  assertTrackedWorktreeClean(repoRoot);
  assertNoUntrackedP63V3RuntimeRepositoryFiles(
    repoRoot
  );
  const checkout =
    resolveCheckoutGitSha(repoRoot);
  if (
    checkout !== receipt.checkoutGitSha
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion final pre-live token checkout drifted: ${receipt.checkoutGitSha} -> ${checkout}`
    );
  }
  const runtimeEnvironment =
    resolveP63V3RuntimeEnvironmentProvenance(
      harnessRoot
    );
  if (
    !sameRuntimeEnvironment(
      receipt.runtimeEnvironment,
      runtimeEnvironment
    )
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion final pre-live token runtime dependency environment drifted"
    );
  }
}

function offlineVerifierEnvironment(
  scratchRoot: string
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
  };
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "P6_3_LIVE_EXECUTION_ALLOWED",
    "P6_3_V3_LIVE_EXECUTION_ALLOWED",
    "P6_3_V3_RSEM_COMPLETION_LIVE_ALLOWED",
    "P6_3_FREEZE_CANDIDATE_OUTPUT",
    "P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT",
    "P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT",
    "P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT",
  ]) {
    delete env[key];
  }
  env.P6_3_LIVE_EXECUTION_ALLOWED = "0";
  env.P6_3_V3_LIVE_EXECUTION_ALLOWED = "0";
  env.P6_3_V3_RSEM_COMPLETION_LIVE_ALLOWED =
    "0";
  env.P6_3_FREEZE_CANDIDATE_OUTPUT =
    path.join(
      scratchRoot,
      "freeze-candidate.json"
    );
  env.P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT =
    path.join(
      scratchRoot,
      "freeze-manifest.json"
    );
  env.P6_3_EXPECTED_MUTATION_PARITY_MANIFEST_OUTPUT =
    path.join(
      scratchRoot,
      "mutation-parity.json"
    );
  env.P6_3_EXPECTED_RSEM_PARITY_MANIFEST_OUTPUT =
    path.join(
      scratchRoot,
      "rsem-parity.json"
    );
  return env;
}

function runVerifier(
  harnessRoot: string,
  scratchRoot: string,
  script: string
): void {
  const scriptPath = path.join(
    harnessRoot,
    script
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(
      `P6-3 v3 Rsem completion final pre-live verifier missing: ${script}`
    );
  }
  const result = spawnSync(
    process.execPath,
    [
      "-r",
      require.resolve("ts-node/register"),
      scriptPath,
    ],
    {
      cwd: harnessRoot,
      encoding: "utf8",
      env: offlineVerifierEnvironment(
        scratchRoot
      ),
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (
    result.error ||
    result.status !== 0
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion final pre-live verifier failed (${script}, exit=${String(result.status)})\nstdout:\n${(result.stdout ?? "").slice(-12000)}\nstderr:\n${(result.stderr ?? result.error?.message ?? "").slice(-12000)}`
    );
  }
}

function resolveCheckoutGitSha(
  repoRoot: string
): string {
  const result = spawnSync(
    "git",
    ["rev-parse", "HEAD"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env },
    }
  );
  if (
    result.error ||
    result.status !== 0
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion final pre-live could not resolve checkout SHA: ${result.error?.message ?? result.stderr}`
    );
  }
  const sha = result.stdout
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(
      `P6-3 v3 Rsem completion final pre-live invalid checkout SHA: ${sha}`
    );
  }
  return sha;
}

function inspectFiles(
  repoRoot: string,
  paths: readonly string[]
):
  readonly P63V3RSemCompletionFinalPreLiveFileEvidence[] {
  return Object.freeze(
    paths.map((item) =>
      inspectFile(repoRoot, item)
    )
  );
}

function inspectFile(
  repoRoot: string,
  repoRelativePath: string
): P63V3RSemCompletionFinalPreLiveFileEvidence {
  const absolute = path.join(
    repoRoot,
    repoRelativePath
  );
  if (
    !fs.existsSync(absolute) ||
    !fs.statSync(absolute).isFile()
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion final pre-live evidence file missing: ${repoRelativePath}`
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
  left:
    Readonly<P63V3RuntimeEnvironmentProvenance>,
  right:
    Readonly<P63V3RuntimeEnvironmentProvenance>
): boolean {
  return (
    left.version === right.version &&
    left.nodeVersion ===
      right.nodeVersion &&
    left.openaiSdkVersion ===
      right.openaiSdkVersion &&
    left.openaiSdkNodeEngine ===
      right.openaiSdkNodeEngine &&
    left.packageLockSha256 ===
      right.packageLockSha256
  );
}
