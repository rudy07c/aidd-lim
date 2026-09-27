import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  assertP63V2PaidLiveGatePassToken,
  P6_3_V2_PAID_LIVE_OPERATIONAL_EVIDENCE_FILES,
  P6_3_V2_PAID_LIVE_SOURCE_FILES,
  P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS,
  runP63V2PaidLiveGate,
} from "./src/p6/p6-3-v2-paid-live-gate";

function main(): void {
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousLiveFlag = process.env.P6_3_LIVE_EXECUTION_ALLOWED;
  process.env.OPENAI_API_KEY = "offline-paid-live-gate-must-never-use-this";
  process.env.P6_3_LIVE_EXECUTION_ALLOWED = "1";

  try {
    const token = runP63V2PaidLiveGate(__dirname);
    assertP63V2PaidLiveGatePassToken(token);
    const receipt = token.receipt;

    assert.equal(receipt.schemaVersion, "p6-3-v2-paid-live-wiring-receipt-v1");
    assert.equal(receipt.gateVersion, "p6-3-v2-paid-live-gate-v1");
    assert.match(receipt.checkoutGitSha, /^[0-9a-f]{40}$/);
    assert.equal(receipt.calibrationOnly, true);
    assert.equal(receipt.confirmatoryStage1AEligible, false);
    assert.equal(receipt.totalLogicalCells, 864);
    assert.equal(receipt.paidLiveAuthorizationRequired, true);
    assert.equal(receipt.liveExecutionWired, true);
    assert.equal(receipt.liveAuthorized, false);
    assert.equal(receipt.providerCallsMade, false);
    assert.equal(receipt.baseFinalPreLiveReceipt.checkoutGitSha, receipt.checkoutGitSha);
    assert.equal(receipt.baseFinalPreLiveReceipt.liveAuthorized, false);
    assert.equal(receipt.baseFinalPreLiveReceipt.providerCallsMade, false);
    assert.equal(receipt.baseFinalPreLiveReceipt.verifiers.length, 15);
    assert.equal(receipt.verifiers.length, P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS.length);
    assert.ok(receipt.verifiers.every((item) => item.status === "pass"));

    const verifyEvidence = (
      evidence: readonly { path: string; sha256: string }[],
      expectedPaths: readonly string[]
    ): void => {
      assert.deepEqual(evidence.map((item) => item.path), [...expectedPaths]);
      for (const item of evidence) assert.match(item.sha256, /^[0-9a-f]{64}$/);
    };

    assert.equal(
      receipt.wiringSpec.path,
      "harness/frozen/p6-3-v2-paid-live-wiring-spec.json"
    );
    assert.match(receipt.wiringSpec.sha256, /^[0-9a-f]{64}$/);
    verifyEvidence(receipt.sourceEvidence, P6_3_V2_PAID_LIVE_SOURCE_FILES);
    verifyEvidence(
      receipt.verifierEvidence,
      P6_3_V2_PAID_LIVE_VERIFIER_SCRIPTS.map((script) => `harness/${script}`)
    );
    verifyEvidence(
      receipt.operationalEvidence,
      P6_3_V2_PAID_LIVE_OPERATIONAL_EVIDENCE_FILES
    );

    const gateSources = [
      "src/p6/p6-3-v2-final-prelive-gate.ts",
      "src/p6/p6-3-v2-paid-live-gate.ts",
    ].map((relative) => ({
      relative,
      source: fs.readFileSync(path.resolve(__dirname, relative), "utf8"),
    }));
    for (const { relative, source } of gateSources) {
      for (const forbidden of [
        'from "./p6-3-v2-live-executors"',
        'from "../agent-backend/openai',
        'from "openai"',
        "OpenAIBackend",
      ]) {
        assert.equal(
          source.includes(forbidden),
          false,
          `${relative} must not import provider code: ${forbidden}`
        );
      }
    }

    const baseOutput = process.env.P6_3_V2_FINAL_PRELIVE_RECEIPT_OUTPUT;
    if (baseOutput) writeJson(path.resolve(__dirname, baseOutput), receipt.baseFinalPreLiveReceipt);
    const paidOutput = process.env.P6_3_V2_PAID_LIVE_RECEIPT_OUTPUT;
    if (paidOutput) writeJson(path.resolve(__dirname, paidOutput), receipt);

    console.log(JSON.stringify({
      ok: true,
      checkoutGitSha: receipt.checkoutGitSha,
      baseVerifierCount: receipt.baseFinalPreLiveReceipt.verifiers.length,
      wiringVerifierCount: receipt.verifiers.length,
      liveExecutionWired: receipt.liveExecutionWired,
      liveAuthorized: receipt.liveAuthorized,
      providerCallsMade: receipt.providerCallsMade,
    }));
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
    if (previousLiveFlag === undefined) delete process.env.P6_3_LIVE_EXECUTION_ALLOWED;
    else process.env.P6_3_LIVE_EXECUTION_ALLOWED = previousLiveFlag;
  }
}

function writeJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main();
