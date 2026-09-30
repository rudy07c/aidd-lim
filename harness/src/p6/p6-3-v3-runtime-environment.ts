import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { getPackageVersion } from "../agent-backend/package-version";

export const P6_3_V3_RUNTIME_ENVIRONMENT_VERSION =
  "p6-3-v3-runtime-environment-v1" as const;

export interface P63V3RuntimeEnvironmentProvenance {
  readonly version: typeof P6_3_V3_RUNTIME_ENVIRONMENT_VERSION;
  readonly nodeVersion: string;
  readonly openaiSdkVersion: string;
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
    packages?: Record<string, { version?: unknown }>;
  };
  const expectedOpenAI = lock.packages?.["node_modules/openai"]?.version;
  if (typeof expectedOpenAI !== "string" || expectedOpenAI.length === 0) {
    throw new Error("P6-3 v3 runtime environment cannot resolve OpenAI version from package-lock.json");
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
  if (!/^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(process.version)) {
    throw new Error(`P6-3 v3 runtime environment unexpected Node version: ${process.version}`);
  }
  return Object.freeze({
    version: P6_3_V3_RUNTIME_ENVIRONMENT_VERSION,
    nodeVersion: process.version,
    openaiSdkVersion: actualOpenAI,
    packageLockSha256: crypto.createHash("sha256").update(lockBytes).digest("hex"),
  });
}
