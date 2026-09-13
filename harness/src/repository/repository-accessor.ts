import { createHash } from "crypto";
import { normalizeRepositoryRelativePath } from "./path-guard";
import {
  ArtifactUnit,
  createArtifactUnit,
  serializeArtifactUnitForWorkingSet,
} from "../measurement/artifact-unit";

export const REPOSITORY_ACCESSOR_SCHEMA_VERSION = "repository-accessor-v1" as const;
export const REPOSITORY_ACCESS_STORAGE_MODE = "read-only-in-memory-snapshot" as const;
export const DEFAULT_SEARCH_MAX_RESULTS = 20;
export const MAX_SEARCH_RESULTS = 100;
export const MAX_SEARCH_QUERY_CHARS = 256;

const FORBIDDEN_SYNTHETIC_WORLD_CONTROL_PATHS = new Set([
  "ground_truth.json",
  "ground_truth_v1_candidate.json",
  "heldout_tasks.json",
  "model_checker.ts",
]);
const FORBIDDEN_SYNTHETIC_WORLD_CONTROL_PREFIXES = [
  "hidden_regression_tests/",
  "runs/",
];

export interface RepositoryListArgs {
  /** Omit for the virtual repository root. Listing is recursive and path-sorted. */
  directory?: string;
}

export interface RepositorySearchArgs {
  /** Literal case-insensitive substring search over repository file contents. */
  query: string;
  /** Harness safety cap; P6 may freeze a scientific value at or below this cap. */
  maxResults?: number;
}

export interface RepositoryReadChunkArgs {
  path: string;
  /** 1-based inclusive source line. Defaults to 1. */
  startLine?: number;
  /** 1-based inclusive source line. Defaults to the final line. */
  endLine?: number;
}

export type RepositoryAccessOperation = "list-files" | "search" | "read-chunk";

/**
 * Trusted-controller result. `units` are the only artifact evidence intended for
 * later WorkingSetManager admission. `resultHash` and counts are harness-side
 * provenance; P5 AR tool adapters must not expose this metadata for free.
 */
export interface RepositoryAccessResult {
  schemaVersion: typeof REPOSITORY_ACCESSOR_SCHEMA_VERSION;
  operation: RepositoryAccessOperation;
  units: ArtifactUnit[];
  resultHash: string;
  totalEvidenceTokens: number;
  /** Search-only provenance; null for list/read. */
  truncated: boolean | null;
  /** Number of matching source lines before maxResults was applied; null otherwise. */
  totalMatches: number | null;
}

export interface RepositoryAccessor {
  listFiles(args?: RepositoryListArgs): Promise<RepositoryAccessResult>;
  search(args: RepositorySearchArgs): Promise<RepositoryAccessResult>;
  readChunk(args: RepositoryReadChunkArgs): Promise<RepositoryAccessResult>;
}

/**
 * P5 provider-neutral, read-only repository accessor.
 *
 * Security boundary:
 * - The accessor has no filesystem handle and cannot resolve arbitrary host paths.
 * - Its complete readable universe is a defensive copy of one trusted
 *   repository-relative snapshot (normally the current generation's `currentFiles`).
 * - Every snapshot key and every path-bearing request goes through the existing
 *   repository path guard.
 * - Known synthetic-world control/evaluator paths are rejected at construction so
 *   accidentally passing the synthetic-world root instead of `repository/` fails
 *   closed rather than silently widening the readable universe.
 *
 * Symlink traversal is structurally absent inside this class because no path is
 * dereferenced after construction. P5 runtime integration must continue to build
 * the snapshot only from the trusted repository root; it must not add a generic
 * filesystem read fallback.
 *
 * This class intentionally does not consume E_max and does not mutate B_work.
 * The P5 retrieval controller/tool boundary owns the required ordering:
 * beginRetrieval() -> accessor candidate -> completeRetrieval() -> W_t admission.
 */
export class InMemoryRepositoryAccessor implements RepositoryAccessor {
  private readonly files: ReadonlyMap<string, string>;
  readonly snapshotHash: string;

  constructor(repositoryFiles: Readonly<Record<string, string>>) {
    const entries = Object.entries(repositoryFiles).sort(([a], [b]) => a.localeCompare(b));
    const validated = new Map<string, string>();

    for (const [rawPath, content] of entries) {
      if (typeof content !== "string") {
        throw new Error(`Repository snapshot content must be string: ${rawPath}`);
      }
      const canonicalPath = normalizeRepositoryRelativePath(rawPath);
      assertNotSyntheticWorldControlPath(canonicalPath);
      if (validated.has(canonicalPath)) {
        throw new Error(`Duplicate repository snapshot path: ${canonicalPath}`);
      }
      validated.set(canonicalPath, content);
    }

    this.files = validated;
    this.snapshotHash = hashSnapshot(validated);
  }

  async listFiles(args: RepositoryListArgs = {}): Promise<RepositoryAccessResult> {
    const directory = normalizeDirectory(args.directory);
    const prefix = directory === null ? "" : `${directory}/`;
    const visiblePaths = [...this.files.keys()]
      .filter((filePath) => filePath.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    const content = visiblePaths.join("\n");
    const listingPath = directory ?? ".";
    const unit = createArtifactUnit({
      id: `listing:${listingPath}:${shortHash(content)}`,
      path: listingPath,
      startLine: 1,
      endLine: Math.max(1, visiblePaths.length),
      content,
      kind: "listing",
    });
    return makeResult("list-files", [unit], null, null);
  }

  async search(args: RepositorySearchArgs): Promise<RepositoryAccessResult> {
    const query = validateSearchQuery(args.query);
    const maxResults = validateSearchMaxResults(args.maxResults);
    const needle = query.toLocaleLowerCase("en-US");
    const matches: Array<{ path: string; line: number; content: string }> = [];

    for (const [filePath, content] of [...this.files.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      const lines = splitSourceLines(content);
      for (let index = 0; index < lines.length; index++) {
        if (lines[index].toLocaleLowerCase("en-US").includes(needle)) {
          matches.push({ path: filePath, line: index + 1, content: lines[index] });
        }
      }
    }

    const queryHash = shortHash(query);
    const selected = matches.slice(0, maxResults);
    const units = selected.map((match, index) =>
      createArtifactUnit({
        id: `search:${queryHash}:${match.path}:L${match.line}:M${index}`,
        path: match.path,
        startLine: match.line,
        endLine: match.line,
        content: match.content,
        kind: "search-result",
      })
    );
    return makeResult(
      "search",
      units,
      matches.length > selected.length,
      matches.length
    );
  }

  async readChunk(args: RepositoryReadChunkArgs): Promise<RepositoryAccessResult> {
    const filePath = normalizeRepositoryRelativePath(args.path);
    assertNotSyntheticWorldControlPath(filePath);
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`Repository file not found in virtual root: ${filePath}`);
    }

    const lines = splitSourceLines(content);
    const startLine = args.startLine ?? 1;
    const endLine = args.endLine ?? lines.length;
    validateLineRange(startLine, endLine, lines.length, filePath);
    const chunkContent = lines.slice(startLine - 1, endLine).join("");
    const unit = createArtifactUnit({
      id: `read:${filePath}:L${startLine}-L${endLine}:${shortHash(chunkContent)}`,
      path: filePath,
      startLine,
      endLine,
      content: chunkContent,
      kind: "chunk",
    });
    return makeResult("read-chunk", [unit], null, null);
  }
}

function normalizeDirectory(directory: string | undefined): string | null {
  if (directory === undefined || directory === "") return null;
  if (directory === ".") {
    throw new Error('Repository root must be requested by omitting directory, not "."');
  }
  const canonical = normalizeRepositoryRelativePath(directory);
  if (canonical.endsWith("/")) {
    throw new Error(`Repository directory must not end with '/': ${directory}`);
  }
  assertNotSyntheticWorldControlPath(canonical);
  return canonical;
}

function validateSearchQuery(query: string): string {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error("Repository search query must be a non-empty string");
  }
  if (query.length > MAX_SEARCH_QUERY_CHARS) {
    throw new Error(
      `Repository search query exceeds ${MAX_SEARCH_QUERY_CHARS} characters`
    );
  }
  if (query.includes("\0")) {
    throw new Error("Repository search query contains NUL byte");
  }
  return query;
}

function validateSearchMaxResults(value: number | undefined): number {
  const resolved = value ?? DEFAULT_SEARCH_MAX_RESULTS;
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > MAX_SEARCH_RESULTS) {
    throw new Error(
      `Repository search maxResults must be an integer between 1 and ${MAX_SEARCH_RESULTS}`
    );
  }
  return resolved;
}

function validateLineRange(
  startLine: number,
  endLine: number,
  totalLines: number,
  filePath: string
): void {
  if (!Number.isInteger(startLine) || startLine < 1) {
    throw new Error("Repository read startLine must be a positive integer");
  }
  if (!Number.isInteger(endLine) || endLine < startLine) {
    throw new Error("Repository read endLine must be an integer >= startLine");
  }
  if (startLine > totalLines || endLine > totalLines) {
    throw new Error(
      `Repository read range exceeds ${filePath}: ` +
        `requested=L${startLine}-L${endLine}, totalLines=${totalLines}`
    );
  }
}

function splitSourceLines(content: string): string[] {
  if (content.length === 0) return [""];
  return content.match(/[^\n]*\n|[^\n]+$/g) ?? [""];
}

function assertNotSyntheticWorldControlPath(filePath: string): void {
  if (
    FORBIDDEN_SYNTHETIC_WORLD_CONTROL_PATHS.has(filePath) ||
    FORBIDDEN_SYNTHETIC_WORLD_CONTROL_PREFIXES.some((prefix) =>
      filePath.startsWith(prefix)
    )
  ) {
    throw new Error(
      `Repository accessor refused synthetic-world control/evaluator path: ${filePath}`
    );
  }
}

function makeResult(
  operation: RepositoryAccessOperation,
  units: ArtifactUnit[],
  truncated: boolean | null,
  totalMatches: number | null
): RepositoryAccessResult {
  const clonedUnits = units.map((unit) => ({ ...unit }));
  return {
    schemaVersion: REPOSITORY_ACCESSOR_SCHEMA_VERSION,
    operation,
    units: clonedUnits,
    resultHash: hashUnits(clonedUnits),
    totalEvidenceTokens: clonedUnits.reduce((sum, unit) => sum + unit.tokenCount, 0),
    truncated,
    totalMatches,
  };
}

function hashUnits(units: readonly ArtifactUnit[]): string {
  const hash = createHash("sha256");
  for (const unit of units) {
    hash.update(unit.id);
    hash.update("\0");
    hash.update(serializeArtifactUnitForWorkingSet(unit));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashSnapshot(files: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const [filePath, content] of files.entries()) {
    hash.update(filePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
