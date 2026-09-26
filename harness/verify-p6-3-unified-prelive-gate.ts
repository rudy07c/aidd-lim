import assert from "assert";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertTrackedWorktreeClean } from "./src/p6/task-bank-live-runtime";
import {
  P6_3_PRELIVE_MANIFEST_SPECS,
  P6_3_PRELIVE_VERIFIER_SCRIPTS,
  P6_3_UNIFIED_PRELIVE_GATE_VERSION,
  assertP63PreLiveGatePassToken,
  inspectP63FrozenManifests,
  runP63UnifiedPreLiveGate,
} from "./src/p6/p6-3-unified-prelive-gate";

function copyManifestSet(harnessRoot: string, targetRoot: string): void {
  fs.mkdirSync(path.join(targetRoot, "frozen"), { recursive: true });
  for (const spec of P6_3_PRELIVE_MANIFEST_SPECS) {
    fs.copyFileSync(
      path.join(harnessRoot, spec.path),
      path.join(targetRoot, spec.path)
    );
  }
}

function runGit(repoRoot: string, args: string[]): void {
  childProcess.execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function verifyTrackedWorktreeGuard(): void {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-prelive-clean-git-"));
  try {
    runGit(repoRoot, ["init"]);
    runGit(repoRoot, ["config", "user.email", "prelive@example.invalid"]);
    runGit(repoRoot, ["config", "user.name", "P6-3 Prelive Verifier"]);
    const trackedPath = path.join(repoRoot, "tracked.txt");
    fs.writeFileSync(trackedPath, "clean\n", "utf8");
    runGit(repoRoot, ["add", "tracked.txt"]);
    runGit(repoRoot, ["commit", "-m", "baseline"]);

    assert.doesNotThrow(
      () => assertTrackedWorktreeClean(repoRoot),
      "clean tracked checkout must pass"
    );

    fs.writeFileSync(trackedPath, "dirty\n", "utf8");
    assert.throws(
      () => assertTrackedWorktreeClean(repoRoot),
      /Scientific live run requires a clean tracked worktree/,
      "dirty tracked checkout must fail closed"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
}

function main(): void {
  const harnessRoot = path.resolve(__dirname);
  const token = runP63UnifiedPreLiveGate(harnessRoot);
  assertP63PreLiveGatePassToken(token);

  const receipt = token.receipt;
  assert.equal(receipt.schemaVersion, "p6-3-unified-prelive-receipt-v1");
  assert.equal(receipt.gateVersion, P6_3_UNIFIED_PRELIVE_GATE_VERSION);
  assert.equal(receipt.preflightPassed, true);
  assert.equal(receipt.liveAuthorized, false);
  assert.match(receipt.checkoutGitSha, /^[0-9a-f]{40}$/);
  assert.equal(receipt.verifiers.length, P6_3_PRELIVE_VERIFIER_SCRIPTS.length);
  assert.deepEqual(
    receipt.verifiers.map((entry) => entry.script),
    [...P6_3_PRELIVE_VERIFIER_SCRIPTS]
  );
  assert(receipt.verifiers.every((entry) => entry.status === "pass"));
  assert.deepEqual(
    Object.keys(receipt.manifests).sort(),
    P6_3_PRELIVE_MANIFEST_SPECS.map((spec) => spec.key).sort()
  );
  for (const spec of P6_3_PRELIVE_MANIFEST_SPECS) {
    const evidence = receipt.manifests[spec.key];
    assert.equal(evidence.path, spec.path);
    assert.equal(evidence.status, spec.expectedStatus);
    assert(evidence.schemaVersion.length > 0);
    assert.match(evidence.sha256, /^[0-9a-f]{64}$/);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-prelive-gate-"));
  try {
    copyManifestSet(harnessRoot, tempRoot);
    const baseline = inspectP63FrozenManifests(tempRoot);
    assert.equal(Object.keys(baseline).length, 4);

    const tamperedSpec = P6_3_PRELIVE_MANIFEST_SPECS[0];
    const tamperedPath = path.join(tempRoot, tamperedSpec.path);
    const tampered = JSON.parse(fs.readFileSync(tamperedPath, "utf8"));
    tampered.status = "draft";
    fs.writeFileSync(tamperedPath, JSON.stringify(tampered, null, 2) + "\n", "utf8");
    assert.throws(
      () => inspectP63FrozenManifests(tempRoot),
      /unexpected status/,
      "tampered frozen status must fail closed"
    );

    copyManifestSet(harnessRoot, tempRoot);
    fs.unlinkSync(path.join(tempRoot, P6_3_PRELIVE_MANIFEST_SPECS[1].path));
    assert.throws(
      () => inspectP63FrozenManifests(tempRoot),
      /frozen manifest missing/,
      "missing manifest must fail closed"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  verifyTrackedWorktreeGuard();

  assert.throws(
    () => assertP63PreLiveGatePassToken({ receipt } as any),
    /requires a valid unified pre-live gate pass token/,
    "an unbranded receipt must not be accepted as a pass token"
  );

  const outputPath = process.env.P6_3_PRELIVE_RECEIPT_OUTPUT;
  if (outputPath) {
    const resolved = path.resolve(harnessRoot, outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify(receipt, null, 2));
}

main();
