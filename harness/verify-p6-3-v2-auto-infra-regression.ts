import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { decideP63AttemptTransition } from "./src/p6/p6-3-execution-protocol";
import { classifyP63V2AutoInfrastructure } from "./src/p6/p6-3-v2-auto-infra";

const FIXTURE_PATH = path.resolve(
  __dirname,
  "frozen/p6-3-v1-auto-infra-regression.json"
);
const FIXTURE_SCHEMA = "p6-3-v1-auto-infra-regression-fixture-v1";
const V1_ARCHIVE_SHA256 = "09c58838f2396ceeabe54f8843b922dee2849d57994843d9a714afcd08debb94";
const V1_CHECKOUT_SHA = "b60b3560a163dfcedf07ffd1dbacc29ed4cf3b7f";

if (!fs.existsSync(FIXTURE_PATH)) {
  throw new Error(
    `Missing actual-v1-artifact regression fixture: ${FIXTURE_PATH}. ` +
    "Generate it from the preserved v1 archive with npm run p6:extract-v1-auto-infra-fixture before enabling v2 live execution."
  );
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as any;
assert.equal(fixture.schemaVersion, FIXTURE_SCHEMA);
assert.equal(fixture.source?.archiveSha256, V1_ARCHIVE_SHA256);
assert.equal(fixture.source?.checkoutGitSha, V1_CHECKOUT_SHA);
assert.match(String(fixture.source?.resultSha256 ?? ""), /^[0-9a-f]{64}$/);
assert.equal(fixture.summary?.attemptCount, 43);
assert.equal(fixture.summary?.replacementAttemptCount, 10);
assert.equal(fixture.summary?.completedLogicalCellsAtStop, 32);
assert.equal(fixture.summary?.exhaustion?.kind, "max-infrastructure-attempts-exhausted");
assert.equal(fixture.summary?.exhaustion?.sequence, 32);
assert.equal(fixture.summary?.exhaustion?.attempt, 3);
assert.ok(Array.isArray(fixture.cases));
assert.equal(fixture.cases.length, 43);

const identities = new Set<string>();
let expectedInfrastructureInvalid = 0;
let automaticallyInfrastructureInvalid = 0;

for (const item of fixture.cases) {
  const sequence = item.identity?.sequence;
  const attempt = item.identity?.attempt;
  assert.ok(Number.isInteger(sequence));
  assert.ok(Number.isInteger(attempt));
  const identity = `${sequence}:${attempt}`;
  assert.ok(!identities.has(identity), `duplicate fixture identity ${identity}`);
  identities.add(identity);

  assert.match(String(item.sourceArtifactSha256 ?? ""), /^[0-9a-f]{64}$/);
  assert.equal(typeof item.sourceArtifactPath, "string");
  assert.ok(item.sourceArtifactPath.length > 0);

  // IMPORTANT: the classifier receives rawEvidence only. It cannot inspect
  // recorded.humanFinalDisposition or expectedAutoDisposition.
  const classification = classifyP63V2AutoInfrastructure({
    executionStatus: nullableString(item.rawEvidence?.executionStatus),
    incompleteReason: nullableString(item.rawEvidence?.incompleteReason),
    outputTokens: nullableNumber(item.rawEvidence?.outputTokens),
    configuredMaxOutputTokens: nullableNumber(item.rawEvidence?.configuredMaxOutputTokens),
    responseStatus: nullableString(item.rawEvidence?.responseStatus),
    providerErrorCode: nullableString(item.rawEvidence?.providerErrorCode),
    errorCategory: nullableString(item.rawEvidence?.errorCategory),
  });

  if (item.expectedAutoDisposition === "infrastructure-invalid") {
    expectedInfrastructureInvalid += 1;
    assert.equal(
      item.recorded?.humanFinalDisposition,
      "infrastructure-invalid",
      `${identity} fixture expected disposition must originate from the recorded human adjudication`
    );
    assert.equal(
      classification.disposition,
      "infrastructure-invalid",
      `${identity} automatic classifier must reproduce the v1 human adjudication`
    );
    automaticallyInfrastructureInvalid += 1;
  } else {
    assert.equal(item.expectedAutoDisposition, "not-infrastructure-invalid");
    assert.notEqual(
      classification.disposition,
      "infrastructure-invalid",
      `${identity} v1 non-adjudicated/scientific outcome must not become automatic infrastructure-invalid`
    );
  }
}

assert.equal(
  expectedInfrastructureInvalid,
  fixture.summary.humanInfrastructureInvalidCount,
  "fixture human infrastructure-invalid summary must equal case-level records"
);
assert.equal(
  automaticallyInfrastructureInvalid,
  expectedInfrastructureInvalid,
  "automatic classifier must reproduce every v1 human infrastructure-invalid adjudication"
);
assert.ok(expectedInfrastructureInvalid > 0);

// Reproduce the exact sequence-32 exhaustion under the frozen v1 attempt
// transition semantics: attempt 1 -> retry, attempt 2 -> retry, attempt 3 -> stop.
const exhausted = fixture.cases
  .filter((item: any) => item.identity?.sequence === 32)
  .sort((a: any, b: any) => a.identity.attempt - b.identity.attempt);
assert.equal(exhausted.length, 3);
for (let index = 0; index < exhausted.length; index += 1) {
  const item = exhausted[index];
  assert.equal(item.identity.attempt, index + 1);
  const classification = classifyP63V2AutoInfrastructure({
    executionStatus: nullableString(item.rawEvidence?.executionStatus),
    incompleteReason: nullableString(item.rawEvidence?.incompleteReason),
    outputTokens: nullableNumber(item.rawEvidence?.outputTokens),
    configuredMaxOutputTokens: nullableNumber(item.rawEvidence?.configuredMaxOutputTokens),
    responseStatus: nullableString(item.rawEvidence?.responseStatus),
    providerErrorCode: nullableString(item.rawEvidence?.providerErrorCode),
    errorCategory: nullableString(item.rawEvidence?.errorCategory),
  });
  assert.equal(classification.disposition, "infrastructure-invalid");
  const transition = decideP63AttemptTransition({
    attempt: item.identity.attempt,
    failureDomain: "infrastructure",
    infrastructureAdjudication: "infrastructure-invalid",
  });
  assert.equal(
    transition,
    item.identity.attempt < 3 ? "retry-same-cell" : "stop-needs-audit"
  );
}

console.log(
  JSON.stringify({
    ok: true,
    fixture: path.relative(__dirname, FIXTURE_PATH),
    attemptsChecked: fixture.cases.length,
    replacementAttempts: fixture.summary.replacementAttemptCount,
    humanInfrastructureInvalid: expectedInfrastructureInvalid,
    autoMatches: automaticallyInfrastructureInvalid,
    exhaustionReproduced: "sequence-32-attempt-3",
  })
);

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
