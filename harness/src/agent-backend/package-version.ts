import * as fs from "fs";
import * as path from "path";

/** Resolve an installed package version without requiring <package>/package.json. */
export function getPackageVersion(packageName: string): string | null {
  try {
    let current = path.dirname(require.resolve(packageName));
    while (true) {
      const candidate = path.join(current, "package.json");
      if (fs.existsSync(candidate)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { name?: string; version?: string };
          if (pkg.name === packageName && typeof pkg.version === "string" && pkg.version.length > 0) {
            return pkg.version;
          }
        } catch {
          // A parent package.json may be unrelated or malformed; keep walking upward.
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    return null;
  }
  return null;
}
