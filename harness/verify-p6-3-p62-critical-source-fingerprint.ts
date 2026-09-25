import assert from "assert";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const evidencePath = path.join(
  repoRoot,
  "docs/findings/evidence/p6-2-af-baseline/result.json"
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const manifest = evidence.executionManifest;

assert(Array.isArray(manifest.criticalSourceFiles));
assert.equal(
  manifest.codeFingerprintSha256,
  "2e81f255fc6149e5699335e67a582172e146acdda0a3deeac893c3600d46fe5b"
);

const hash = crypto.createHash("sha256");
for (const relativePath of manifest.criticalSourceFiles as string[]) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `missing P6-2 critical source: ${relativePath}`);
  hash.update(relativePath);
  hash.update("\0");
  hash.update(fs.readFileSync(absolutePath));
  hash.update("\0");
}
const currentCriticalSourceFingerprintSha256 = hash.digest("hex");

assert.equal(
  currentCriticalSourceFingerprintSha256,
  manifest.codeFingerprintSha256,
  "current P6-2 mutation/measurement critical-source fingerprint differs from the historical P6-2 AF baseline; P6-3 parity must stop for audit rather than silently accepting drift"
);

const runnerPath = path.join(repoRoot, "harness/p6-af-baseline-live.ts");
const currentRunnerSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(runnerPath))
  .digest("hex");
assert.equal(
  currentRunnerSha256,
  manifest.runnerSha256,
  "current P6-2 AF runner differs byte-for-byte from the historical runner"
);

console.log(JSON.stringify({
  status: "ok",
  sourceGitSha: manifest.gitSha,
  criticalSourceCount: manifest.criticalSourceFiles.length,
  criticalSourceFingerprintSha256: currentCriticalSourceFingerprintSha256,
  runnerSha256: currentRunnerSha256,
}, null, 2));
