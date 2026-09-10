import { countCanonicalTokens } from "./token-counter";
import { normalizeRepositoryPath } from "./file-classification";

export type ArtifactUnitKind = "file" | "chunk" | "search-result" | "listing";

export interface ArtifactUnit {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
  kind: ArtifactUnitKind;
}

export function createArtifactUnit(args: {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  kind: ArtifactUnitKind;
}): ArtifactUnit {
  if (!args.id) throw new Error("ArtifactUnit id must be non-empty");
  if (!Number.isInteger(args.startLine) || args.startLine < 0) throw new Error("ArtifactUnit startLine must be a non-negative integer");
  if (!Number.isInteger(args.endLine) || args.endLine < args.startLine) throw new Error("ArtifactUnit endLine must be >= startLine");
  return {
    ...args,
    path: normalizeRepositoryPath(args.path),
    tokenCount: countCanonicalTokens(args.content),
  };
}

/**
 * Deterministically split one repository file into units whose content fits maxTokens.
 * Line boundaries are preferred. If a single line itself exceeds the budget, it is
 * split by the largest character prefix that fits. The resulting segment keeps the
 * source line number for both startLine/endLine.
 */
export function chunkArtifactFile(
  filePath: string,
  content: string,
  maxTokens: number
): ArtifactUnit[] {
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new Error("ArtifactUnit maxTokens must be a positive integer");
  }
  const normalizedPath = normalizeRepositoryPath(filePath);
  if (content.length === 0) {
    return [createArtifactUnit({
      id: `${normalizedPath}:L1-L1:C0`,
      path: normalizedPath,
      startLine: 1,
      endLine: 1,
      content: "",
      kind: "chunk",
    })];
  }

  const lines = content.split(/(?<=\n)/);
  const pieces: Array<{ content: string; startLine: number; endLine: number }> = [];
  let current = "";
  let currentStart = 1;
  let currentEnd = 1;
  let lineNo = 1;

  const flush = () => {
    if (current.length === 0) return;
    pieces.push({ content: current, startLine: currentStart, endLine: currentEnd });
    current = "";
  };

  for (const line of lines) {
    if (countCanonicalTokens(line) > maxTokens) {
      flush();
      let remaining = line;
      while (remaining.length > 0) {
        const length = largestPrefixWithinBudget(remaining, maxTokens);
        if (length <= 0) throw new Error(`Unable to split ArtifactUnit line within maxTokens=${maxTokens}`);
        const piece = remaining.slice(0, length);
        pieces.push({ content: piece, startLine: lineNo, endLine: lineNo });
        remaining = remaining.slice(length);
      }
    } else {
      const candidate = current + line;
      if (current.length > 0 && countCanonicalTokens(candidate) > maxTokens) {
        flush();
        currentStart = lineNo;
        current = line;
        currentEnd = lineNo;
      } else {
        if (current.length === 0) currentStart = lineNo;
        current = candidate;
        currentEnd = lineNo;
      }
    }
    lineNo += countNewlines(line);
  }
  flush();

  return pieces.map((piece, index) => createArtifactUnit({
    id: `${normalizedPath}:L${piece.startLine}-L${piece.endLine}:C${index}`,
    path: normalizedPath,
    startLine: piece.startLine,
    endLine: piece.endLine,
    content: piece.content,
    kind: "chunk",
  }));
}

export function repositoryToArtifactUnits(
  files: Record<string, string>,
  maxTokensPerUnit: number
): ArtifactUnit[] {
  return Object.entries(files)
    .sort(([a], [b]) => normalizeRepositoryPath(a).localeCompare(normalizeRepositoryPath(b)))
    .flatMap(([filePath, content]) => chunkArtifactFile(filePath, content, maxTokensPerUnit));
}

function countNewlines(value: string): number {
  return (value.match(/\n/g) ?? []).length || 1;
}

function largestPrefixWithinBudget(value: string, maxTokens: number): number {
  let low = 1;
  let high = value.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (countCanonicalTokens(value.slice(0, mid)) <= maxTokens) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}
