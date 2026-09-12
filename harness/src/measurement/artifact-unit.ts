import { countCanonicalTokens } from "./token-counter";
import { normalizeRepositoryPath } from "./file-classification";

export type ArtifactUnitKind = "file" | "chunk" | "search-result" | "listing";

export interface ArtifactUnit {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  /** Canonical tokens of serializeArtifactUnitForWorkingSet(this), not content-only tokens. */
  tokenCount: number;
  /** Harness-side provenance only; intentionally not exposed in the model-visible serialization. */
  kind: ArtifactUnitKind;
}

type ModelVisibleArtifactUnit = Pick<ArtifactUnit, "path" | "startLine" | "endLine" | "content">;

/**
 * Canonical model-visible representation for one working-set artifact unit.
 *
 * B_work is defined over the exact artifact evidence shown to the model, not over
 * content alone. Repository-derived path and line range are serialized as one
 * compact JSON metadata line; the source content is appended raw after a single
 * newline and is never JSON-escaped. This avoids making quote/backslash/newline
 * density an artificial working-set cost while still budgeting the framing that
 * the model actually sees.
 *
 * `kind` is deliberately excluded: it is harness-side provenance/selector
 * metadata and exposing it would add an artificial cue that is not part of the
 * repository evidence itself.
 *
 * P4/P5 prompt construction must reuse the returned string verbatim rather than
 * inventing a second framing format. The string passed to countCanonicalTokens()
 * and the string shown to the model must remain identical.
 */
export function serializeArtifactUnitForWorkingSet(unit: ModelVisibleArtifactUnit): string {
  const metadata = JSON.stringify({
    path: normalizeRepositoryPath(unit.path),
    lines: [unit.startLine, unit.endLine],
  });
  return `${metadata}\n${unit.content}`;
}

export function countArtifactUnitWorkingSetTokens(unit: ModelVisibleArtifactUnit): number {
  return countCanonicalTokens(serializeArtifactUnitForWorkingSet(unit));
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
  const normalized = {
    ...args,
    path: normalizeRepositoryPath(args.path),
  };
  return {
    ...normalized,
    tokenCount: countArtifactUnitWorkingSetTokens(normalized),
  };
}

/**
 * Deterministically split one repository file into units whose complete
 * model-visible evidence serialization fits maxTokens. Line boundaries are
 * preferred. If a single line itself exceeds the budget, it is split by the
 * largest character prefix whose path + line range + raw-content representation fits.
 * The resulting segment keeps the source line number for both startLine/endLine.
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
    const empty = createArtifactUnit({
      id: `${normalizedPath}:L1-L1:C0`,
      path: normalizedPath,
      startLine: 1,
      endLine: 1,
      content: "",
      kind: "chunk",
    });
    if (empty.tokenCount > maxTokens) {
      throw new Error(
        `ArtifactUnit metadata alone exceeds maxTokens=${maxTokens} for ${normalizedPath}`
      );
    }
    return [empty];
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
    if (evidenceTokens(normalizedPath, lineNo, lineNo, line) > maxTokens) {
      flush();
      let remaining = line;
      while (remaining.length > 0) {
        const length = largestPrefixWithinBudget(
          remaining,
          maxTokens,
          normalizedPath,
          lineNo
        );
        if (length <= 0) {
          throw new Error(
            `Unable to split ArtifactUnit line within maxTokens=${maxTokens}; ` +
            `model-visible metadata leaves no room for content (${normalizedPath}:${lineNo})`
          );
        }
        const piece = remaining.slice(0, length);
        pieces.push({ content: piece, startLine: lineNo, endLine: lineNo });
        remaining = remaining.slice(length);
      }
    } else {
      const candidate = current + line;
      if (
        current.length > 0 &&
        evidenceTokens(normalizedPath, currentStart, lineNo, candidate) > maxTokens
      ) {
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

  const units = pieces.map((piece, index) => createArtifactUnit({
    id: `${normalizedPath}:L${piece.startLine}-L${piece.endLine}:C${index}`,
    path: normalizedPath,
    startLine: piece.startLine,
    endLine: piece.endLine,
    content: piece.content,
    kind: "chunk",
  }));
  for (const unit of units) {
    if (unit.tokenCount > maxTokens) {
      throw new Error(
        `ArtifactUnit working-set serialization exceeded maxTokens=${maxTokens}: ${unit.id}`
      );
    }
  }
  return units;
}

export function repositoryToArtifactUnits(
  files: Record<string, string>,
  maxTokensPerUnit: number
): ArtifactUnit[] {
  return Object.entries(files)
    .sort(([a], [b]) => normalizeRepositoryPath(a).localeCompare(normalizeRepositoryPath(b)))
    .flatMap(([filePath, content]) => chunkArtifactFile(filePath, content, maxTokensPerUnit));
}

function evidenceTokens(
  path: string,
  startLine: number,
  endLine: number,
  content: string
): number {
  return countArtifactUnitWorkingSetTokens({ path, startLine, endLine, content });
}

function countNewlines(value: string): number {
  return (value.match(/\n/g) ?? []).length || 1;
}

function largestPrefixWithinBudget(
  value: string,
  maxTokens: number,
  path: string,
  lineNo: number
): number {
  let low = 1;
  let high = value.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (evidenceTokens(path, lineNo, lineNo, value.slice(0, mid)) <= maxTokens) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}
