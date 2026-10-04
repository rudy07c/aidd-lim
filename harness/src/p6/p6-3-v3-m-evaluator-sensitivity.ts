import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import { runScoring } from "../scoring";
import {
  buildMFailureBoundaryAuditReport,
  type MFailureAuditClass,
  type MFailureAuditRow,
} from "../../analyze-p6-3-v3-m-evaluator-boundary";

export const P6_3_V3_M_CORRECTED_EVALUATOR_VERSION =
  "p6-3-v3-m-corrected-evaluator-opaque-handle-v1" as const;
export const P6_3_V3_M_SENSITIVITY_VERSION =
  "p6-3-v3-m-corrected-evaluator-sensitivity-v1" as const;

export interface SensitivityTask {
  taskId: string;
  taskSpecificTestCode?: string;
}

export interface CorrectedMRow {
  sequence: number;
  taskId: string;
  repeat: number;
  armLabel: string;
  originalClassification: MFailureAuditClass;
  originalPassed: boolean;
  correctedPassed: boolean;
  correctedVisiblePassed: boolean;
  correctedHiddenPassed: boolean;
  correctedTaskSpecificPassed: boolean | null;
  correctedProtocolContractViolated: boolean;
  changed: boolean;
  artifactPath: string;
}

export interface CorrectedMEvaluatorSensitivityReport {
  schemaVersion: typeof P6_3_V3_M_SENSITIVITY_VERSION;
  analysisClass: "post-hoc-design-audit-sensitivity";
  primaryEvidenceMutated: false;
  providerCallsMade: false;
  evaluator: {
    version: typeof P6_3_V3_M_CORRECTED_EVALUATOR_VERSION;
    originalHiddenEvaluatorSha256: string;
    correctedHiddenEvaluatorSha256: string;
    transformation: string[];
  };
  scope: "proof" | "full";
  selectedSequences: number[];
  rows: CorrectedMRow[];
  summary: {
    total: number;
    originalPasses: number;
    correctedPasses: number;
    changedToPass: number;
    changedToFail: number;
    byOriginalClass: Record<string, {
      total: number;
      originalPasses: number;
      correctedPasses: number;
      changedToPass: number;
      changedToFail: number;
    }>;
    byArm: Record<string, {
      total: number;
      originalPasses: number;
      correctedPasses: number;
      changedToPass: number;
      changedToFail: number;
    }>;
  };
}

export function buildOpaqueHandleHGSource(original: string): string {
  const importLine =
    'import { WorldState } from "../repository/src/world";';
  if (!original.includes(importLine)) {
    throw new Error("H(G) opaque-handle transform: expected concrete WorldState import missing");
  }

  let corrected = original.replace(importLine, [
    'type WorldStateHandle = ReturnType<typeof protocol.reset>;',
    '',
    '// Sensitivity evaluator correction:',
    '// keep repository state opaque and interact only through protocol.',
  ].join("\n"));

  corrected = corrected
    .replace(
      /function apply\(world: WorldState, op: string\): WorldState \{/,
      "function apply(world: WorldStateHandle, op: string): WorldStateHandle {"
    )
    .replace(
      /function tryApply\(world: WorldState, op: string\): \{ ok: boolean; error\?: string \} \{/,
      "function tryApply(world: WorldStateHandle, op: string): { ok: boolean; error?: string } {"
    );

  if (/\bWorldState\b/.test(corrected)) {
    throw new Error("H(G) opaque-handle transform left a concrete WorldState reference");
  }
  if (/\.\.\/repository\/src\/world/.test(corrected)) {
    throw new Error("H(G) opaque-handle transform still imports repository/src/world");
  }

  // Guard against accidental semantic test editing. Only the import/type helper
  // prefix may change; all describe/test bodies must remain byte-identical.
  const originalBody = original.slice(original.indexOf('describe("H(G)'));
  const correctedBody = corrected.slice(corrected.indexOf('describe("H(G)'));
  if (!originalBody || originalBody !== correctedBody) {
    throw new Error("H(G) opaque-handle transform changed test bodies");
  }
  return corrected;
}

export async function runCorrectedMEvaluatorSensitivity(args: {
  repoRoot: string;
  scope: "proof" | "full";
}): Promise<CorrectedMEvaluatorSensitivityReport> {
  const audit = buildMFailureBoundaryAuditReport(args.repoRoot);
  const syntheticWorldDir = path.join(args.repoRoot, "synthetic-world");
  const originalHGPath = path.join(
    syntheticWorldDir,
    "hidden_regression_tests",
    "H_G.test.ts"
  );
  const originalHG = fs.readFileSync(originalHGPath, "utf8");
  const correctedHG = buildOpaqueHandleHGSource(originalHG);
  const repositoryFiles = loadRepositoryFiles(
    path.join(syntheticWorldDir, "repository")
  );
  const taskById = loadTasks(syntheticWorldDir);

  const selected =
    args.scope === "full"
      ? audit.rows
      : selectProofRows(audit.rows);

  return withSensitivityWorld(
    syntheticWorldDir,
    correctedHG,
    async (sensitivityWorldDir) => {
      const rows: CorrectedMRow[] = [];
      for (const row of selected) {
        const artifact = JSON.parse(
          fs.readFileSync(path.join(args.repoRoot, row.artifactPath), "utf8")
        ) as any;
        const modifiedFiles =
          artifact?.agent?.modifiedFiles &&
          typeof artifact.agent.modifiedFiles === "object"
            ? artifact.agent.modifiedFiles as Record<string, string>
            : {};
        const merged = { ...repositoryFiles, ...modifiedFiles };
        const task = taskById.get(row.taskId);
        if (!task) throw new Error(`Sensitivity task missing: ${row.taskId}`);

        const scoring = await runScoring(
          merged,
          sensitivityWorldDir,
          task.taskSpecificTestCode
        );
        const correctedPassed =
          scoring.visibleTests.passed &&
          scoring.hiddenTests.passed &&
          (scoring.taskSpecificTests?.passed ?? true) &&
          !scoring.protocolContractViolated;

        rows.push({
          sequence: row.sequence,
          taskId: row.taskId,
          repeat: row.repeat,
          armLabel: row.armLabel,
          originalClassification: row.classification,
          originalPassed: row.originalPassed,
          correctedPassed,
          correctedVisiblePassed: scoring.visibleTests.passed,
          correctedHiddenPassed: scoring.hiddenTests.passed,
          correctedTaskSpecificPassed: scoring.taskSpecificTests?.passed ?? null,
          correctedProtocolContractViolated: scoring.protocolContractViolated,
          changed: correctedPassed !== row.originalPassed,
          artifactPath: row.artifactPath,
        });
      }

      return {
        schemaVersion: P6_3_V3_M_SENSITIVITY_VERSION,
        analysisClass: "post-hoc-design-audit-sensitivity",
        primaryEvidenceMutated: false,
        providerCallsMade: false,
        evaluator: {
          version: P6_3_V3_M_CORRECTED_EVALUATOR_VERSION,
          originalHiddenEvaluatorSha256: sha256(originalHG),
          correctedHiddenEvaluatorSha256: sha256(correctedHG),
          transformation: [
            "remove direct repository/src/world WorldState import",
            "derive opaque WorldStateHandle as ReturnType<typeof protocol.reset>",
            "replace helper concrete WorldState annotations with opaque handle",
            "preserve all H(G) describe/test bodies byte-identically",
          ],
        },
        scope: args.scope,
        selectedSequences: rows.map((row) => row.sequence),
        rows,
        summary: summarize(rows),
      };
    }
  );
}

function selectProofRows(rows: readonly MFailureAuditRow[]): MFailureAuditRow[] {
  const picked: MFailureAuditRow[] = [];
  const take = (
    predicate: (row: MFailureAuditRow) => boolean,
    count: number,
    label: string
  ) => {
    const matches = rows.filter(predicate).slice(0, count);
    if (matches.length !== count) {
      throw new Error(`Proof selection missing ${label}: expected ${count}, got ${matches.length}`);
    }
    picked.push(...matches);
  };

  // Deterministic, outcome-diagnostic proof only. This selection is not used to
  // estimate corrected M; full sensitivity always re-scores all 792.
  take(
    (row) =>
      row.classification === "C_EVALUATOR_INTERNAL_TYPE_COUPLING" &&
      row.armLabel === "B2",
    3,
    "B2 C"
  );
  take(
    (row) =>
      row.classification === "C_EVALUATOR_INTERNAL_TYPE_COUPLING" &&
      row.armLabel === "B3",
    3,
    "B3 C"
  );
  take((row) => row.classification === "PASS" && row.armLabel === "B1", 1, "B1 PASS");
  take((row) => row.classification === "PASS" && row.armLabel === "AF", 1, "AF PASS");
  take(
    (row) => row.classification === "A_CANDIDATE_FAILURE_EVIDENCE",
    1,
    "A candidate failure"
  );
  take(
    (row) => row.classification === "B_FIXED_PROTOCOL_VIOLATION",
    1,
    "B protocol failure"
  );

  return picked.sort((a, b) => a.sequence - b.sequence);
}

function summarize(rows: readonly CorrectedMRow[]) {
  const make = () => ({
    total: 0,
    originalPasses: 0,
    correctedPasses: 0,
    changedToPass: 0,
    changedToFail: 0,
  });
  const total = make();
  const byOriginalClass: Record<string, ReturnType<typeof make>> = {};
  const byArm: Record<string, ReturnType<typeof make>> = {};

  for (const row of rows) {
    for (const bucket of [
      total,
      (byOriginalClass[row.originalClassification] ??= make()),
      (byArm[row.armLabel] ??= make()),
    ]) {
      bucket.total += 1;
      if (row.originalPassed) bucket.originalPasses += 1;
      if (row.correctedPassed) bucket.correctedPasses += 1;
      if (!row.originalPassed && row.correctedPassed) bucket.changedToPass += 1;
      if (row.originalPassed && !row.correctedPassed) bucket.changedToFail += 1;
    }
  }
  return {
    ...total,
    byOriginalClass: sortRecord(byOriginalClass),
    byArm: sortRecord(byArm),
  };
}

async function withSensitivityWorld<T>(
  syntheticWorldDir: string,
  correctedHG: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-sensitivity-world-"));
  try {
    fs.copyFileSync(path.join(syntheticWorldDir, "schema.ts"), path.join(tmp, "schema.ts"));
    fs.copyFileSync(path.join(syntheticWorldDir, "jest.config.js"), path.join(tmp, "jest.config.js"));
    fs.symlinkSync(path.join(syntheticWorldDir, "node_modules"), path.join(tmp, "node_modules"), "dir");
    copyDirRecursive(
      path.join(syntheticWorldDir, "hidden_regression_tests"),
      path.join(tmp, "hidden_regression_tests")
    );
    fs.writeFileSync(
      path.join(tmp, "hidden_regression_tests", "H_G.test.ts"),
      correctedHG,
      "utf8"
    );
    return await fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function loadRepositoryFiles(repositoryDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) {
        out[path.relative(repositoryDir, full).split(path.sep).join("/")] =
          fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(repositoryDir);
  return out;
}

function loadTasks(syntheticWorldDir: string): Map<string, SensitivityTask> {
  const raw = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")
  ) as Array<Record<string, unknown>>;
  const out = new Map<string, SensitivityTask>();
  for (const item of raw) {
    const taskId = typeof item.taskId === "string" ? item.taskId : "";
    if (!taskId) continue;
    out.set(taskId, {
      taskId,
      taskSpecificTestCode:
        typeof item.taskSpecificTestCode === "string"
          ? item.taskSpecificTestCode
          : undefined,
    });
  }
  return out;
}

function copyDirRecursive(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
