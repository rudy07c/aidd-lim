import assert from "assert";
import * as path from "path";
import {
  P6_3_RSEM_PROVIDER_CONTRACT,
} from "./src/p6/p6-3-rsem-protocol-parity";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-spec";
import {
  loadP63V3InheritedMEvidence,
} from "./src/p6/p6-3-v3-inherited-m-evidence";
import {
  buildP63V3RSemCompletionPlan,
  p63V3RSemCompletionPlanHash,
} from "./src/p6/p6-3-v3-rsem-completion-plan";
import {
  P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION,
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
} from "./src/p6/p6-3-v3-rsem-completion-predeclaration";

const repoRoot = path.resolve(__dirname, "..");
const inherited = loadP63V3InheritedMEvidence(repoRoot);
const plan = buildP63V3RSemCompletionPlan();
const planHash = p63V3RSemCompletionPlanHash(plan);

assert.equal(
  inherited.sourceStateSha256,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256
);
assert.equal(
  inherited.mEvidenceSemanticSha256,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256
);
assert.equal(
  inherited.fixedEnvironmentIdentity,
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
);
assert.equal(
  inherited.validMLogicalCells,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS
);
assert.equal(inherited.infrastructureInvalidMAttempts, 0);
assert.equal(inherited.rows.length, 792);
assert.equal(inherited.sourceStateTerminalStatus, "needs-audit");
assert.equal(inherited.sourceCursorCellIndex, 793);

const armCounts = new Map<string, number>();
const repeatCounts = new Map<number, number>();
for (const row of inherited.rows) {
  armCounts.set(
    row.armLabel,
    (armCounts.get(row.armLabel) ?? 0) + 1
  );
  repeatCounts.set(
    row.repeat,
    (repeatCounts.get(row.repeat) ?? 0) + 1
  );
}
for (const arm of ["B0", "B1", "B2", "B3", "B4", "AF"] as const) {
  assert.equal(armCounts.get(arm), 132);
}
for (let repeat = 1; repeat <= 12; repeat += 1) {
  assert.equal(repeatCounts.get(repeat), 66);
}

assert.equal(
  plan.length,
  P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS
);
for (let index = 0; index < plan.length; index += 1) {
  assert.equal(plan[index].collectionSequence, index);
  assert.equal(plan[index].canonicalV3Sequence, 792 + index);
  assert.equal(plan[index].measurement, "Rsem");
  assert.equal(plan[index].taskId, null);
}
const rsemArmCounts = new Map<string, number>();
for (const cell of plan) {
  rsemArmCounts.set(
    cell.armLabel,
    (rsemArmCounts.get(cell.armLabel) ?? 0) + 1
  );
}
for (const arm of ["B0", "B1", "B2", "B3", "B4", "AF"] as const) {
  assert.equal(rsemArmCounts.get(arm), 12);
}

assert.equal(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.model,
  P6_3_RSEM_PROVIDER_CONTRACT.model
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.reasoningEffort,
  P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
  32000
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.requestTimeoutMs,
  P6_3_RSEM_PROVIDER_CONTRACT.requestTimeoutMs
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
  P6_3_RSEM_PROVIDER_CONTRACT.providerMaxRetries
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
  2
);
assert.equal(
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.provider.providerMaxRetries,
  0
);
assert.notEqual(
  P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.provider.providerMaxRetries
);

assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.inheritedM.expectedLogicalCells,
  792
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.freshRSem.expectedLogicalCells,
  72
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.combinedAnalysis.expectedLogicalCells,
  P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.freshRSem.oldStoppedRunRsemObservationReuseAllowed,
  false
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.freshRSem.reliabilityAuditObservationPoolingAllowed,
  false
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.combinedAnalysis.stoppedV3RsemPooling,
  false
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.combinedAnalysis.reliabilityAuditPooling,
  false
);
assert.equal(
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION.liveAuthorization,
  false
);

console.log(JSON.stringify({
  status: "ok",
  slice: "p6-3-v3-rsem-completion-predeclaration",
  inheritedM: {
    sourceStateSha256: inherited.sourceStateSha256,
    mEvidenceSemanticSha256: inherited.mEvidenceSemanticSha256,
    validLogicalCells: inherited.validMLogicalCells,
    infrastructureInvalidAttempts: inherited.infrastructureInvalidMAttempts,
    armCounts: Object.fromEntries(armCounts),
    repeatCounts: Object.fromEntries(repeatCounts),
  },
  freshRSem: {
    logicalCells: plan.length,
    planHash,
    canonicalSequenceRange: [
      plan[0].canonicalV3Sequence,
      plan[plan.length - 1].canonicalV3Sequence,
    ],
    providerMaxOutputTokens:
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.maxOutputTokens,
    providerMaxRetries:
      P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT.providerMaxRetries,
    fixedEnvironmentIdentity:
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  },
  combinedLogicalCells:
    P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
  providerCallsMade: false,
}, null, 2));
