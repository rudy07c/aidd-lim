import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_FROZEN_EVIDENCE_FILES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_INPUT_FILES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_OPERATIONAL_EVIDENCE_FILES,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_SOURCE_FILES,
  assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken,
  runP63V3RSemReliabilityAuditFinalPreLiveGate,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-final-prelive-gate";

const harnessRoot = __dirname;
const token = runP63V3RSemReliabilityAuditFinalPreLiveGate(harnessRoot);
const receipt = token.receipt;

assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken(token);

assert.equal(
  receipt.schemaVersion,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_RECEIPT_SCHEMA
);
assert.equal(
  receipt.gateVersion,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_GATE_VERSION
);
assert.equal(receipt.runClass, "reliability-audit");
assert.equal(receipt.scientificPoolingAllowed, false);
assert.equal(receipt.confirmatoryStage1AEligible, false);
assert.deepEqual(receipt.candidateCaps, [32000, 64000]);
assert.equal(receipt.hardAuditCap, 64000);
assert.equal(receipt.plannedValidTrialCeiling, 120);
assert.equal(receipt.providerAttemptCeiling, 360);
assert.equal(receipt.operationalCostCeilingUsd, 22);
assert.equal(receipt.preflightPassed, true);
assert.equal(receipt.exactCleanCheckoutVerified, true);
assert.equal(receipt.runtimeConsumedUntrackedFilesVerified, true);
assert.equal(receipt.paidLiveAuthorizationRequired, true);
assert.equal(receipt.liveAuthorized, false);
assert.equal(receipt.providerCallsMade, false);
assert.match(receipt.checkoutGitSha, /^[0-9a-f]{40}$/);

assert.deepEqual(
  receipt.verifiers.map((item) => item.script),
  [...P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS]
);
assert(receipt.verifiers.every((item) => item.status === "pass"));

assertEvidencePaths(
  receipt.sourceEvidence,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_SOURCE_FILES
);
assertEvidencePaths(
  receipt.frozenEvidence,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_FROZEN_EVIDENCE_FILES
);
assertEvidencePaths(
  receipt.operationalEvidence,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_OPERATIONAL_EVIDENCE_FILES
);
assertEvidencePaths(
  receipt.inputEvidence,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_INPUT_FILES
);
assertEvidencePaths(
  receipt.verifierEvidence,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_FINAL_PRELIVE_VERIFIER_SCRIPTS.map(
    (script) => `harness/${script}`
  )
);

const gateSource = fs.readFileSync(
  path.join(
    __dirname,
    "src",
    "p6",
    "p6-3-v3-rsem-reliability-audit-final-prelive-gate.ts"
  ),
  "utf8"
);
assert(
  gateSource.includes('"OPENAI_API_KEY"'),
  "final pre-live gate must strip OPENAI_API_KEY from verifier environment"
);
assert(
  gateSource.includes(
    '"P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ALLOWED"'
  ),
  "final pre-live gate must strip audit paid-live authorization from verifier environment"
);
assert(
  gateSource.includes("providerCallsMade: false"),
  "final pre-live receipt must remain non-self-authorizing"
);
assert(
  gateSource.includes(
    "assertNoUntrackedP63V3RuntimeRepositoryFiles(repoRoot)"
  ),
  "final pre-live gate must reject untracked runtime-consumed repository files"
);

console.log(JSON.stringify({
  status: "ok",
  slice: "p6-3-v3-rsem-reliability-audit-final-prelive",
  checkoutGitSha: receipt.checkoutGitSha,
  runtimeEnvironment: receipt.runtimeEnvironment,
  candidateCaps: receipt.candidateCaps,
  plannedValidTrialCeiling: receipt.plannedValidTrialCeiling,
  providerAttemptCeiling: receipt.providerAttemptCeiling,
  operationalCostCeilingUsd: receipt.operationalCostCeilingUsd,
  providerCallsMade: receipt.providerCallsMade,
  verified: [
    "actual-final-prelive-gate-executed",
    "exact-clean-checkout-bound",
    "runtime-environment-bound",
    "untracked-runtime-input-rejected",
    "32k-64k-envelope-bound",
    "120-valid-360-attempt-boundary-bound",
    "22-usd-operational-ceiling-bound",
    "predeclaration-cost-freeze-operational-evidence-hashed",
    "provider-credentials-stripped-from-offline-verifier",
    "paid-live-environment-stripped-from-offline-verifier",
    "receipt-is-non-self-authorizing",
  ],
}, null, 2));

function assertEvidencePaths(
  actual: readonly { readonly path: string; readonly sha256: string }[],
  expected: readonly string[]
): void {
  assert.deepEqual(
    actual.map((item) => item.path),
    [...expected]
  );
  for (const item of actual) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
  }
}
