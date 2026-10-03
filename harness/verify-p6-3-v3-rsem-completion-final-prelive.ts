import assert from "assert";
import {
  assertP63V3RSemCompletionFinalPreLiveGatePassToken,
  runP63V3RSemCompletionFinalPreLiveGate,
  P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_VERIFIER_SCRIPTS,
} from "./src/p6/p6-3-v3-rsem-completion-final-prelive-gate";
import {
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
} from "./src/p6/p6-3-v3-rsem-completion-predeclaration";

function main(): void {
  const token =
    runP63V3RSemCompletionFinalPreLiveGate(
      __dirname
    );
  assertP63V3RSemCompletionFinalPreLiveGatePassToken(
    token
  );
  const receipt = token.receipt;

  assert.equal(
    receipt.runClass,
    "scientific-calibration-completion"
  );
  assert.equal(
    receipt.calibrationOnly,
    true
  );
  assert.equal(
    receipt.confirmatoryStage1AEligible,
    false
  );
  assert.equal(
    receipt.freshRSemLogicalCells,
    72
  );
  assert.equal(
    receipt.inheritedMLogicalCells,
    792
  );
  assert.equal(
    receipt.combinedAnalysisLogicalCells,
    864
  );
  assert.equal(
    receipt.inheritedMSourceStateSha256,
    P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256
  );
  assert.equal(
    receipt.inheritedMSemanticSha256,
    P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256
  );
  assert.equal(
    receipt.freshRSemPlanSha256,
    P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_PLAN_SHA256
  );
  assert.equal(
    receipt.fixedEnvironmentIdentity,
    P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  );
  assert.equal(
    receipt.providerMaxOutputTokens,
    32000
  );
  assert.equal(
    receipt.providerMaxOutputTokens,
    P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT
      .maxOutputTokens
  );
  assert.equal(
    receipt.providerMaxRetries,
    P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT
      .providerMaxRetries
  );
  assert.equal(
    receipt.preflightPassed,
    true
  );
  assert.equal(
    receipt.exactCleanCheckoutVerified,
    true
  );
  assert.equal(
    receipt.runtimeConsumedUntrackedFilesVerified,
    true
  );
  assert.equal(
    receipt.paidLiveAuthorizationRequired,
    true
  );
  assert.equal(
    receipt.liveAuthorized,
    false
  );
  assert.equal(
    receipt.providerCallsMade,
    false
  );
  assert.equal(
    receipt.verifiers.length,
    P6_3_V3_RSEM_COMPLETION_FINAL_PRELIVE_VERIFIER_SCRIPTS.length
  );
  assert.equal(
    receipt.verifiers.every(
      (item) => item.status === "pass"
    ),
    true
  );

  const sourcePaths = new Set(
    receipt.sourceEvidence.map(
      (item) => item.path
    )
  );
  for (const required of [
    "harness/src/p6/p6-3-v3-rsem-completion-executor.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-runner.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-controller.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-finalizer.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-entrypoint.ts",
    "harness/src/p6/p6-3-v3-rsem-completion-final-prelive-gate.ts",
    "harness/p6-3-v3-rsem-completion.ts",
    "harness/p6-3-v3-rsem-completion-finalize.ts",
  ]) {
    assert(
      sourcePaths.has(required),
      `final pre-live source evidence missing ${required}`
    );
  }

  assert.throws(
    () =>
      assertP63V3RSemCompletionFinalPreLiveGatePassToken(
        {
          receipt,
        } as any
      ),
    /valid final pre-live gate token/
  );

  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-completion-final-prelive",
    providerCallsMade: false,
    checkoutGitSha:
      receipt.checkoutGitSha,
    freshRSemLogicalCells:
      receipt.freshRSemLogicalCells,
    inheritedMLogicalCells:
      receipt.inheritedMLogicalCells,
    combinedAnalysisLogicalCells:
      receipt.combinedAnalysisLogicalCells,
    providerMaxOutputTokens:
      receipt.providerMaxOutputTokens,
    providerMaxRetries:
      receipt.providerMaxRetries,
    verifierCount:
      receipt.verifiers.length,
    sourceEvidenceCount:
      receipt.sourceEvidence.length,
    frozenEvidenceCount:
      receipt.frozenEvidence.length,
    inputEvidenceCount:
      receipt.inputEvidence.length,
    verified: [
      "exact-clean-checkout",
      "runtime-node-openai-lock-provenance",
      "no-untracked-runtime-repository-files",
      "inherited-M-state-and-semantic-hashes",
      "fresh-72-plan-hash",
      "fixed-environment-identity",
      "32k-scientific-provider-envelope",
      "completion-runtime-controller-finalizer-source-evidence",
      "non-self-authorizing-receipt",
      "zero-provider-calls",
    ],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
