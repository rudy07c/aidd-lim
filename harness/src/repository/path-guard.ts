import * as path from "path";

/**
 * Agent / harness が扱う repository-relative path を正規化し、
 * repository root 外へ抜ける path を拒否する。
 *
 * このguardはagent出力をmergeする境界と、scoring workspaceへ書き込む境界の
 * 両方で使用する。片側だけのvalidationに依存しない。
 */
export function normalizeRepositoryRelativePath(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new Error("Repository path must be a non-empty string");
  }
  if (input.includes("\0")) {
    throw new Error(`Repository path contains NUL byte: ${JSON.stringify(input)}`);
  }

  const slashPath = input.replace(/\\/g, "/");

  if (slashPath.startsWith("/") || /^[A-Za-z]:\//.test(slashPath)) {
    throw new Error(`Absolute repository path is not allowed: ${input}`);
  }

  const normalized = path.posix.normalize(slashPath);

  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Repository path escapes root: ${input}`);
  }

  // "./src/x.ts" のような曖昧表現も禁止し、log/hash上のpath表現を一意にする。
  if (normalized !== slashPath) {
    throw new Error(`Repository path is not canonical: ${input} -> ${normalized}`);
  }

  return normalized;
}

export function validateModifiedFiles(
  files: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [rawPath, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      throw new Error(`Modified file content must be string: ${rawPath}`);
    }
    const normalized = normalizeRepositoryRelativePath(rawPath);
    if (Object.prototype.hasOwnProperty.call(result, normalized)) {
      throw new Error(`Duplicate repository path after normalization: ${normalized}`);
    }
    result[normalized] = content;
  }

  return result;
}
