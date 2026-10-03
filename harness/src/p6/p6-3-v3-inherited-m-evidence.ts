import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  P6_3_V3_LIVE_CONTROLLER_VERSION,
  P6_3_V3_LIVE_STATE_SCHEMA,
  type P63V3AttemptRecord,
  type P63V3LiveCalibrationState,
} from "./p6-3-v3-live-controller";
import {
  buildP63V3CalibrationPlan,
  p63V3CalibrationPlanHash,
} from "./p6-3-v3-calibration-runner";
import {
  P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
  P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
  P6_3_V3_RSEM_COMPLETION_SOURCE_CHECKOUT_SHA,
  P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH,
  P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
  P6_3_V3_RSEM_COMPLETION_SOURCE_TREATMENT_PROVENANCE_HASH,
} from "./p6-3-v3-rsem-completion-predeclaration";

export const P6_3_V3_INHERITED_M_EVIDENCE_VERSION =
  "p6-3-v3-inherited-m-evidence-v1" as const;

export interface P63V3InheritedMEvidence {
  readonly version: typeof P6_3_V3_INHERITED_M_EVIDENCE_VERSION;
  readonly sourceStatePath:
    typeof P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH;
  readonly sourceStateSha256:
    typeof P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256;
  readonly sourceCheckoutGitSha:
    typeof P6_3_V3_RSEM_COMPLETION_SOURCE_CHECKOUT_SHA;
  readonly sourcePlanHash:
    typeof P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH;
  readonly sourceTreatmentProvenanceHash:
    typeof P6_3_V3_RSEM_COMPLETION_SOURCE_TREATMENT_PROVENANCE_HASH;
  readonly fixedEnvironmentIdentity:
    typeof P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY;
  readonly mEvidenceSemanticSha256:
    typeof P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256;
  readonly validMLogicalCells: 792;
  readonly infrastructureInvalidMAttempts: 0;
  readonly sourceStateTerminalStatus: "needs-audit";
  readonly sourceCursorCellIndex: 793;
  readonly rows: readonly P63V3AttemptRecord[];
}

export function loadP63V3InheritedMEvidence(
  repoRoot: string
): Readonly<P63V3InheritedMEvidence> {
  const sourcePath = path.join(
    repoRoot,
    P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH
  );
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(
      `P6-3 v3 inherited M source state missing: ${P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH}`
    );
  }
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceStateSha256 = sha256(sourceBytes);
  if (
    sourceStateSha256 !==
    P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256
  ) {
    throw new Error(
      `P6-3 v3 inherited M source state hash drift: ${sourceStateSha256}`
    );
  }

  const state = JSON.parse(
    sourceBytes.toString("utf8")
  ) as P63V3LiveCalibrationState;
  assertSourceStateIdentity(state);

  const canonicalPlan = buildP63V3CalibrationPlan();
  const canonicalPlanHash = p63V3CalibrationPlanHash(canonicalPlan);
  if (
    canonicalPlanHash !== P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH ||
    state.planHash !== canonicalPlanHash
  ) {
    throw new Error(
      "P6-3 v3 inherited M canonical/source plan hash mismatch"
    );
  }

  const canonicalM = canonicalPlan.filter(
    (cell) => cell.measurement === "M"
  );
  if (
    canonicalM.length !==
    P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS
  ) {
    throw new Error(
      `P6-3 v3 inherited M canonical plan expected 792 M cells, got ${canonicalM.length}`
    );
  }

  const allMAttempts = state.attempts.filter(
    (attempt) => attempt.measurement === "M"
  );
  if (
    allMAttempts.length !==
    P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS
  ) {
    throw new Error(
      `P6-3 v3 inherited M source expected exactly 792 M attempts, got ${allMAttempts.length}`
    );
  }

  const infrastructureInvalidM = allMAttempts.filter(
    (attempt) => attempt.effectiveValidity === "infrastructure-invalid"
  );
  if (infrastructureInvalidM.length !== 0) {
    throw new Error(
      `P6-3 v3 inherited M source contains ${infrastructureInvalidM.length} infrastructure-invalid M attempts`
    );
  }

  const rows = [...allMAttempts].sort(
    (left, right) => left.sequence - right.sequence
  );
  for (let sequence = 0; sequence < canonicalM.length; sequence += 1) {
    const row = rows[sequence];
    const cell = canonicalM[sequence];
    if (!row || row.sequence !== sequence) {
      throw new Error(
        `P6-3 v3 inherited M sequence gap at ${sequence}`
      );
    }
    if (
      row.attempt !== 1 ||
      row.effectiveValidity !== "valid" ||
      row.measurement !== "M"
    ) {
      throw new Error(
        `P6-3 v3 inherited M sequence ${sequence} is not one clean valid M attempt`
      );
    }
    assertAttemptMatchesCanonicalMCell(row, cell);
    if (
      typeof row.passed !== "boolean" ||
      row.semanticScore !== (row.passed ? 1 : 0)
    ) {
      throw new Error(
        `P6-3 v3 inherited M sequence ${sequence} pass/score mismatch`
      );
    }
  }

  const semanticHash = sha256(
    Buffer.from(stableJson(rows), "utf8")
  );
  if (
    semanticHash !==
    P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256
  ) {
    throw new Error(
      `P6-3 v3 inherited M semantic hash drift: ${semanticHash}`
    );
  }

  return Object.freeze({
    version: P6_3_V3_INHERITED_M_EVIDENCE_VERSION,
    sourceStatePath:
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH,
    sourceStateSha256:
      P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
    sourceCheckoutGitSha:
      P6_3_V3_RSEM_COMPLETION_SOURCE_CHECKOUT_SHA,
    sourcePlanHash:
      P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH,
    sourceTreatmentProvenanceHash:
      P6_3_V3_RSEM_COMPLETION_SOURCE_TREATMENT_PROVENANCE_HASH,
    fixedEnvironmentIdentity:
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
    mEvidenceSemanticSha256:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_SEMANTIC_SHA256,
    validMLogicalCells:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
    infrastructureInvalidMAttempts: 0,
    sourceStateTerminalStatus: "needs-audit",
    sourceCursorCellIndex: 793,
    rows: Object.freeze(rows),
  });
}

function assertSourceStateIdentity(
  state: Readonly<P63V3LiveCalibrationState>
): void {
  if (
    state.schemaVersion !== P6_3_V3_LIVE_STATE_SCHEMA ||
    state.controllerVersion !== P6_3_V3_LIVE_CONTROLLER_VERSION ||
    state.runClass !== "scientific-calibration" ||
    state.calibrationOnly !== true ||
    state.confirmatoryStage1AEligible !== false
  ) {
    throw new Error(
      "P6-3 v3 inherited M source state schema/provenance mismatch"
    );
  }
  if (
    state.status !== "needs-audit" ||
    state.cursorCellIndex !== 793 ||
    state.inFlight !== null
  ) {
    throw new Error(
      "P6-3 v3 inherited M source state stop boundary mismatch"
    );
  }
  if (
    state.checkoutGitSha !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_CHECKOUT_SHA ||
    state.planHash !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH ||
    state.treatmentProvenanceHash !==
      P6_3_V3_RSEM_COMPLETION_SOURCE_TREATMENT_PROVENANCE_HASH ||
    state.fixedEnvironmentIdentity !==
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY
  ) {
    throw new Error(
      "P6-3 v3 inherited M source identity drift"
    );
  }
}

function assertAttemptMatchesCanonicalMCell(
  attempt: Readonly<P63V3AttemptRecord>,
  cell: ReturnType<typeof buildP63V3CalibrationPlan>[number]
): void {
  if (
    cell.measurement !== "M" ||
    attempt.sequence !== cell.sequence ||
    attempt.measurement !== cell.measurement ||
    attempt.taskId !== cell.taskId ||
    attempt.repeat !== cell.repeat ||
    attempt.armLabel !== cell.armLabel ||
    attempt.armKind !== cell.armKind ||
    attempt.budgetTokens !== cell.budgetTokens
  ) {
    throw new Error(
      `P6-3 v3 inherited M canonical identity mismatch at sequence ${cell.sequence}`
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson(record[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
