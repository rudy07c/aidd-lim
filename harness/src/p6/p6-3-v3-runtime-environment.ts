import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { getPackageVersion } from "../agent-backend/package-version";

export const P6_3_V3_RUNTIME_ENVIRONMENT_VERSION =
  "p6-3-v3-runtime-environment-v2-openai-node-engine" as const;

export interface P63V3RuntimeEnvironmentProvenance {
  readonly version: typeof P6_3_V3_RUNTIME_ENVIRONMENT_VERSION;
  readonly nodeVersion: string;
  readonly openaiSdkVersion: string;
  readonly openaiSdkNodeEngine: string;
  readonly packageLockSha256: string;
}

/**
 * P6-3 v3 loads synthetic-world/repository recursively from the local filesystem.
 * A Git-untracked TypeScript file there can therefore change the scientific input
 * while the older tracked-only clean check still passes. Reject exactly that
 * runtime-consumed class without banning unrelated untracked run outputs.
 */
export function listUntrackedP63V3RuntimeRepositoryFiles(
  repoRoot: string
): readonly string[] {
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      "synthetic-world/repository",
    ],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env } }
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `P6-3 v3 could not inspect untracked runtime repository files: ` +
      `${result.error?.message ?? result.stderr}`
    );
  }
  return Object.freeze(
    result.stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.endsWith(".ts"))
      .sort()
  );
}

export function assertNoUntrackedP63V3RuntimeRepositoryFiles(repoRoot: string): void {
  const files = listUntrackedP63V3RuntimeRepositoryFiles(repoRoot);
  if (files.length > 0) {
    throw new Error(
      "P6-3 v3 final pre-live refused: Git-untracked TypeScript file(s) are present under synthetic-world/repository and would be consumed by the live repository loader:\n" +
      files.join("\n")
    );
  }
}

/**
 * Fail closed on the OpenAI SDK Node engine form we have actually frozen.
 *
 * We deliberately do not implement a partial npm-semver interpreter here. The
 * lockfile and installed package must agree on one simple minimum range
 * (`>=X.Y.Z`). If a future SDK changes that syntax, pre-live must stop until the
 * runtime contract is reviewed rather than guessing whether the new range is
 * satisfied.
 */
export function assertNodeVersionSatisfiesOpenAIEngine(
  nodeVersion: string,
  engineRange: string
): void {
  const actual = parseNodeVersion(nodeVersion);
  const minimumMatch = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(engineRange.trim());
  if (!minimumMatch) {
    throw new Error(
      `P6-3 v3 runtime environment unsupported OpenAI Node engine range: ${engineRange}`
    );
  }
  const minimum: readonly [number, number, number] = [
    Number(minimumMatch[1]),
    Number(minimumMatch[2]),
    Number(minimumMatch[3]),
  ];
  if (compareVersionTuple(actual, minimum) < 0) {
    throw new Error(
      `P6-3 v3 final pre-live refused: Node ${nodeVersion} does not satisfy installed OpenAI SDK engine ${engineRange}`
    );
  }
}

/**
 * Resolve and verify the concrete runtime dependency provenance for the machine
 * that is about to run the final gate. This is intentionally based on installed
 * packages, not only package.json intent.
 */
export function resolveP63V3RuntimeEnvironmentProvenance(
  harnessRoot: string
): Readonly<P63V3RuntimeEnvironmentProvenance> {
  const lockPath = path.join(harnessRoot, "package-lock.json");
  if (!fs.existsSync(lockPath) || !fs.statSync(lockPath).isFile()) {
    throw new Error(`P6-3 v3 runtime environment package-lock missing: ${lockPath}`);
  }
  const lockBytes = fs.readFileSync(lockPath);
  const lock = JSON.parse(lockBytes.toString("utf8")) as {
    packages?: Record<string, { version?: unknown; engines?: { node?: unknown } }>;
  };
  const lockedOpenAI = lock.packages?.["node_modules/openai"];
  const expectedOpenAI = lockedOpenAI?.version;
  const expectedOpenAIEngine = lockedOpenAI?.engines?.node;
  if (typeof expectedOpenAI !== "string" || expectedOpenAI.length === 0) {
    throw new Error("P6-3 v3 runtime environment cannot resolve OpenAI version from package-lock.json");
  }
  if (typeof expectedOpenAIEngine !== "string" || expectedOpenAIEngine.length === 0) {
    throw new Error("P6-3 v3 runtime environment cannot resolve OpenAI Node engine from package-lock.json");
  }

  const actualOpenAI = getPackageVersion("openai");
  if (!actualOpenAI) {
    throw new Error("P6-3 v3 runtime environment cannot resolve installed OpenAI SDK version");
  }
  if (actualOpenAI !== expectedOpenAI) {
    throw new Error(
      `P6-3 v3 runtime environment OpenAI SDK mismatch: installed=${actualOpenAI}, lock=${expectedOpenAI}`
    );
  }

  const installedOpenAIPackagePath = path.join(harnessRoot, "node_modules", "openai", "package.json");
  if (!fs.existsSync(installedOpenAIPackagePath) || !fs.statSync(installedOpenAIPackagePath).isFile()) {
    throw new Error(
      `P6-3 v3 runtime environment installed OpenAI package.json missing: ${installedOpenAIPackagePath}`
    );
  }
  const installedOpenAIPackage = JSON.parse(
    fs.readFileSync(installedOpenAIPackagePath, "utf8")
  ) as { version?: unknown; engines?: { node?: unknown } };
  const installedOpenAIEngine = installedOpenAIPackage.engines?.node;
  if (installedOpenAIPackage.version !== actualOpenAI) {
    throw new Error(
      `P6-3 v3 runtime environment installed OpenAI package metadata mismatch: package.json=${String(installedOpenAIPackage.version)}, resolved=${actualOpenAI}`
    );
  }
  if (typeof installedOpenAIEngine !== "string" || installedOpenAIEngine.length === 0) {
    throw new Error("P6-3 v3 runtime environment installed OpenAI package has no Node engine declaration");
  }
  if (installedOpenAIEngine !== expectedOpenAIEngine) {
    throw new Error(
      `P6-3 v3 runtime environment OpenAI Node engine mismatch: installed=${installedOpenAIEngine}, lock=${expectedOpenAIEngine}`
    );
  }

  assertNodeVersionSatisfiesOpenAIEngine(process.version, installedOpenAIEngine);

  return Object.freeze({
    version: P6_3_V3_RUNTIME_ENVIRONMENT_VERSION,
    nodeVersion: process.version,
    openaiSdkVersion: actualOpenAI,
    openaiSdkNodeEngine: installedOpenAIEngine,
    packageLockSha256: crypto.createHash("sha256").update(lockBytes).digest("hex"),
  });
}

function parseNodeVersion(value: string): readonly [number, number, number] {
  // Production calibration accepts stable Node releases only. Treat prerelease
  // or build-tagged runtimes as unreviewed rather than approximating npm semver.
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error(`P6-3 v3 runtime environment unexpected or non-stable Node version: ${value}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersionTuple(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}
