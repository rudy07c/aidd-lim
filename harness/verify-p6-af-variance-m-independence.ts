import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT } from "./src/p6/af-baseline";

const AUDIT_REPO_PATH = "docs/findings/evidence/p6-2-m-independence-audit.json";
const EXPECTED_SCHEMA = "p6-2-m-variance-independence-audit-v1";
const EXPECTED_RECORDS = 8 * 11 * 2;

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const auditPath = path.join(repoRoot, AUDIT_REPO_PATH);
  if (!fs.existsSync(auditPath)) {
    throw new Error(
      `P6-2 merge blocked: ${AUDIT_REPO_PATH} is missing. ` +
      "The fresh M variance sample is not formally freeze-eligible until the historical/fresh journal provenance audit is committed."
    );
  }

  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  assert.equal(audit.schemaVersion, EXPECTED_SCHEMA);
  assert.equal(audit.verdict, "independent-new-api-calls");
  assert.equal(audit.summary.expectedRecordCount, EXPECTED_RECORDS);
  assert.equal(audit.summary.comparedRecordCount, EXPECTED_RECORDS);
  assert.equal(audit.summary.missingFreshArtifactRecordCount, 0);
  assert.equal(audit.summary.missingHistoricalArtifactRecordCount, 0);
  assert.equal(audit.summary.missingFreshResponseIdCount, 0);
  assert.equal(audit.summary.missingHistoricalResponseIdCount, 0);
  assert.equal(audit.summary.freshUniqueResponseIdCount, EXPECTED_RECORDS);
  assert.equal(audit.summary.sameResponseIdCount, 0);
  assert.equal(audit.summary.sameRawResponseCount, 0);
  assert.equal(audit.summary.freshJournalTimestampOutOfWindowCount, 0);
  assert.equal(audit.summary.allFreshJournalTimesAfterHistoricalMax, true);
  assert.equal(audit.records.length, EXPECTED_RECORDS);

  const keys = new Set<string>();
  const freshIds = new Set<string>();
  for (const row of audit.records) {
    assert.equal(typeof row.key, "string");
    assert(!keys.has(row.key), `duplicate audit key: ${row.key}`);
    keys.add(row.key);
    assert.equal(typeof row.freshResponseId, "string");
    assert.equal(typeof row.historicalResponseId, "string");
    assert.notEqual(row.freshResponseId, row.historicalResponseId, `response ID reused: ${row.key}`);
    assert(!freshIds.has(row.freshResponseId), `fresh response ID duplicated across records: ${row.freshResponseId}`);
    freshIds.add(row.freshResponseId);
    assert.equal(row.rawResponseEqual, false, `raw M response reused: ${row.key}`);
    assert.equal(typeof row.freshRawResponseSha256, "string");
    assert.equal(typeof row.historicalRawResponseSha256, "string");
    assert.equal(typeof row.freshJournalTimestamp, "string");
    assert.equal(typeof row.historicalJournalTimestamp, "string");
  }

  // N=21 only becomes a valid formal freeze once this verifier can establish
  // independent fresh-M provenance from committed machine-readable evidence.
  assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, 21);

  console.log("P6-2 M variance independence verification passed.");
  console.log(`  matched M records: ${EXPECTED_RECORDS}`);
  console.log("  reused response IDs: 0");
  console.log("  reused raw responses: 0");
  console.log("  formal repeat freeze 21 is provenance-eligible");
}

main();
