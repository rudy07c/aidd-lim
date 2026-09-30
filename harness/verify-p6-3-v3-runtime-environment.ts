import assert from "assert";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  assertNoUntrackedP63V3RuntimeRepositoryFiles,
  listUntrackedP63V3RuntimeRepositoryFiles,
  P6_3_V3_RUNTIME_ENVIRONMENT_VERSION,
  resolveP63V3RuntimeEnvironmentProvenance,
} from "./src/p6/p6-3-v3-runtime-environment";

function runGit(cwd: string, args: readonly string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  }
}

function main(): void {
  const harnessRoot = __dirname;
  const runtime = resolveP63V3RuntimeEnvironmentProvenance(harnessRoot);
  assert.equal(runtime.version, P6_3_V3_RUNTIME_ENVIRONMENT_VERSION);
  assert.match(runtime.nodeVersion, /^v\d+\.\d+\.\d+/);
  assert.match(runtime.openaiSdkVersion, /^\d+\.\d+\.\d+(?:[-+].*)?$/);
  assert.match(runtime.packageLockSha256, /^[0-9a-f]{64}$/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "p6-3-v3-runtime-env-"));
  try {
    runGit(tempRoot, ["init", "-q"]);
    const repositoryDir = path.join(tempRoot, "synthetic-world", "repository");
    fs.mkdirSync(repositoryDir, { recursive: true });
    fs.writeFileSync(path.join(repositoryDir, "tracked.ts"), "export const tracked = true;\n", "utf8");
    runGit(tempRoot, ["add", "synthetic-world/repository/tracked.ts"]);

    assert.deepEqual(listUntrackedP63V3RuntimeRepositoryFiles(tempRoot), []);
    assert.doesNotThrow(() => assertNoUntrackedP63V3RuntimeRepositoryFiles(tempRoot));

    fs.writeFileSync(path.join(repositoryDir, "notes.md"), "not consumed by the v3 repository loader\n", "utf8");
    assert.deepEqual(listUntrackedP63V3RuntimeRepositoryFiles(tempRoot), []);
    assert.doesNotThrow(() => assertNoUntrackedP63V3RuntimeRepositoryFiles(tempRoot));

    fs.writeFileSync(path.join(repositoryDir, "injected.ts"), "export const injected = true;\n", "utf8");
    assert.deepEqual(
      listUntrackedP63V3RuntimeRepositoryFiles(tempRoot),
      ["synthetic-world/repository/injected.ts"]
    );
    assert.throws(
      () => assertNoUntrackedP63V3RuntimeRepositoryFiles(tempRoot),
      /Git-untracked TypeScript file\(s\).*synthetic-world\/repository/s
    );

    fs.rmSync(path.join(repositoryDir, "injected.ts"));
    assert.doesNotThrow(() => assertNoUntrackedP63V3RuntimeRepositoryFiles(tempRoot));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  process.stdout.write(JSON.stringify({
    verifier: "p6-3-v3-runtime-environment-v1",
    providerCalls: 0,
    runtime,
    checks: [
      "installed-openai-sdk-matches-package-lock",
      "node-version-recorded",
      "package-lock-sha256-recorded",
      "tracked-runtime-repository-file-allowed",
      "untracked-non-ts-runtime-directory-file-not-consumed",
      "untracked-runtime-consumed-ts-file-rejected",
    ],
  }, null, 2) + "\n");
}

main();
