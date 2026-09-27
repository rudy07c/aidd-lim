import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  assertP63V2FinalPreLiveGatePassToken,
  P6_3_V2_FINAL_FROZEN_EVIDENCE_FILES,
  P6_3_V2_FINAL_OPERATIONAL_EVIDENCE_FILES,
  P6_3_V2_FINAL_SOURCE_FILES,
  P6_3_V2_FINAL_VERIFIER_SCRIPTS,
  runP63V2FinalPreLiveGate,
} from "./src/p6/p6-3-v2-final-prelive-gate";

function main(): void {
  const harnessRoot = __dirname;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousLiveFlag = process.env.P6_3_LIVE_EXECUTION_ALLOWED;
  process.env.OPENAI_API_KEY = "offline-final-gate-must-never-use-this";
  process.env.P6_3_LIVE_EXECUTION_ALLOWED = "1";

  try {
    const token = runP63V2FinalPreLiveGate(harnessRoot);
    assertP63V2FinalPreLiveGatePassToken(token);
    const receipt = token.receipt;

    assert.equal(receipt.schemaVersion, "p6-3-v2-final-prelive-receipt-v1");
    assert.equal(receipt.gateVersion, "p6-3-v2-final-prelive-gate-v1");
    assert.match(receipt.checkoutGitSha, /^[0-9a-f]{40}$/);
    assert.equal(receipt.calibrationOnly, true);
    assert.equal(receipt.confirmatoryStage1AEligible, false);
    assert.equal(receipt.totalLogicalCells, 864);
    assert.equal(receipt.mutationMaxOutputTokens, 14000);
    assert.equal(receipt.rsemMaxOutputTokens, 8000);
    assert.equal(receipt.maxScientificAttemptsPerLogicalCell, 3);
    assert.equal(receipt.preflightPassed, true);
    assert.equal(receipt.finalPreLiveGateFrozen, true);
    assert.equal(receipt.paidLiveAuthorizationRequired, true);
    assert.equal(receipt.liveAuthorized, false);
    assert.equal(receipt.providerCallsMade, false);
    assert.equal(receipt.verifiers.length, P6_3_V2_FINAL_VERIFIER_SCRIPTS.length);
    assert.deepEqual(
      receipt.verifiers.map((item) => item.script),
      [...P6_3_V2_FINAL_VERIFIER_SCRIPTS]
    );
    assert.ok(receipt.verifiers.every((item) => item.status === "pass"));

    const verifyEvidence = (
      evidence: readonly { path: string; sha256: string }[],
      expectedPaths: readonly string[]
    ): void => {
      assert.deepEqual(evidence.map((item) => item.path), [...expectedPaths]);
      for (const item of evidence) assert.match(item.sha256, /^[0-9a-f]{64}$/);
    };

    assert.equal(receipt.finalSpec.path, "harness/frozen/p6-3-v2-final-prelive-spec.json");
    assert.match(receipt.finalSpec.sha256, /^[0-9a-f]{64}$/);
    verifyEvidence(receipt.frozenEvidence, P6_3_V2_FINAL_FROZEN_EVIDENCE_FILES);
    verifyEvidence(receipt.sourceEvidence, P6_3_V2_FINAL_SOURCE_FILES);
    verifyEvidence(
      receipt.verifierEvidence,
      P6_3_V2_FINAL_VERIFIER_SCRIPTS.map((script) => `harness/${script}`)
    );
    verifyEvidence(receipt.operationalEvidence, P6_3_V2_FINAL_OPERATIONAL_EVIDENCE_FILES);

    assert.throws(
      () => assertP63V2FinalPreLiveGatePassToken({ receipt } as any),
      /valid final pre-live gate pass token/
    );

    const sourcePath = path.resolve(
      harnessRoot,
      "src/p6/p6-3-v2-final-prelive-gate.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf8");
    for (const forbiddenImport of [
      'from "./p6-3-v2-live-executors"',
      'from "../agent-backend/openai',
      'from "openai"',
    ]) {
      assert.equal(
        source.includes(forbiddenImport),
        false,
        `final pre-live gate must not import provider execution code: ${forbiddenImport}`
      );
    }

    const outputPath = process.env.P6_3_V2_FINAL_PRELIVE_RECEIPT_OUTPUT;
    if (outputPath) {
      const absoluteOutput = path.resolve(harnessRoot, outputPath);
      fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
      fs.writeFileSync(absoluteOutput, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    }

    console.log(
      JSON.stringify({
        ok: true,
        checkoutGitSha: receipt.checkoutGitSha,
        verifierCount: receipt.verifiers.length,
        frozenEvidenceCount: receipt.frozenEvidence.length,
        sourceEvidenceCount: receipt.sourceEvidence.length,
        verifierEvidenceCount: receipt.verifierEvidence.length,
        finalPreLiveGateFrozen: receipt.finalPreLiveGateFrozen,
        liveAuthorized: receipt.liveAuthorized,
        providerCallsMade: receipt.providerCallsMade,
      })
    );
  } finally {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
    if (previousLiveFlag === undefined) delete process.env.P6_3_LIVE_EXECUTION_ALLOWED;
    else process.env.P6_3_LIVE_EXECUTION_ALLOWED = previousLiveFlag;
  }
}

main();
