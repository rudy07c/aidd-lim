import {
  P6_3_V2_SECONDARY_ENDPOINT_IDS,
  P6_3_V2_SECONDARY_SUMMARY_IDS,
} from "./p6-3-v2-execution-parameters";
import { P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID } from "./p6-3-v2-auto-infra";
import type { P63CalibrationCell } from "./p6-3-live-calibration-runner";
import type {
  P63V2CalibrationExecutor,
  P63V2CalibrationState,
  P63V2CellOutcome,
} from "./p6-3-v2-live-calibration-runner";

export const P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA =
  "p6-3-v2-secondary-reliability-attempt-artifact-v1" as const;
export const P6_3_V2_SECONDARY_RELIABILITY_SUMMARY_SCHEMA =
  "p6-3-v2-secondary-reliability-summary-v1" as const;
export const P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE =
  "nearest-rank-q25-q50-q75-v1" as const;

const ARM_ORDER = ["B0", "B1", "B2", "B3", "B4", "AF"] as const;
type ArmLabel = (typeof ARM_ORDER)[number];

export interface P63V2ReliabilityTelemetry {
  readonly tokenUsage: {
    readonly input: number | null;
    readonly output: number | null;
    readonly reasoningOutput: number | null;
    readonly total: number | null;
  };
  readonly configuredMaxOutputTokens: number | null;
  readonly incompleteReason: string | null;
}

export interface P63V2ReliabilityCellOutcome extends P63V2CellOutcome {
  readonly reliabilityTelemetry: P63V2ReliabilityTelemetry;
}

export interface P63V2ReliabilityAttemptArtifact {
  readonly schemaVersion: typeof P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA;
  readonly identity: {
    readonly sequence: number;
    readonly measurement: "M" | "Rsem";
    readonly taskId: string | null;
    readonly repeat: number;
    readonly armLabel: ArmLabel;
    readonly attempt: number;
  };
  readonly telemetry: P63V2ReliabilityTelemetry;
  readonly scientificArtifactPayload: unknown;
}

export interface P63V2SecondaryAttemptRow {
  readonly sequence: number;
  readonly measurement: "M" | "Rsem";
  readonly taskId: string | null;
  readonly repeat: number;
  readonly armLabel: ArmLabel;
  readonly attempt: number;
  readonly executionStatus: string;
  readonly effectiveFailureDomain: string;
  readonly maxOutputCensored: boolean;
  readonly outputTokens: number | null;
  readonly reasoningOutputTokens: number | null;
  readonly inputTokens: number | null;
  readonly totalTokens: number | null;
  readonly configuredMaxOutputTokens: number | null;
  readonly incompleteReason: string | null;
}

export interface P63V2SecondaryLogicalCellRow {
  readonly sequence: number;
  readonly measurement: "M" | "Rsem";
  readonly taskId: string | null;
  readonly repeat: number;
  readonly armLabel: ArmLabel;
  readonly attemptCount: number;
  readonly anyMaxOutputCensoring: boolean;
  readonly attemptsToValidScientificObservation: number | null;
  readonly censoredExhausted: boolean;
}

export interface P63V2DistributionSummary {
  readonly observed: number;
  readonly missing: number;
  readonly rawSorted: readonly number[];
  readonly min: number | null;
  readonly q25: number | null;
  readonly q50: number | null;
  readonly q75: number | null;
  readonly max: number | null;
}

export interface P63V2ArmReliabilitySummary {
  readonly armLabel: ArmLabel;
  readonly attempts: number;
  readonly maxOutputCensoredAttempts: number;
  readonly attemptCensoringRate: number | null;
  readonly attemptedLogicalCells: number;
  readonly logicalCellsWithAnyCensoring: number;
  readonly logicalCellCensoringRate: number | null;
  readonly attemptCountDistribution: P63V2DistributionSummary;
  readonly attemptsToValidScientificObservation: P63V2DistributionSummary;
  readonly outputTokens: P63V2DistributionSummary;
  readonly reasoningOutputTokens: P63V2DistributionSummary;
}

export interface P63V2MTaskArmReliabilitySummary {
  readonly taskId: string;
  readonly armLabel: ArmLabel;
  readonly attempts: number;
  readonly maxOutputCensoredAttempts: number;
  readonly attemptCensoringRate: number | null;
  readonly attemptedLogicalCells: number;
  readonly logicalCellsWithAnyCensoring: number;
  readonly logicalCellCensoringRate: number | null;
}

export interface P63V2SecondaryReliabilitySummary {
  readonly schemaVersion: typeof P6_3_V2_SECONDARY_RELIABILITY_SUMMARY_SCHEMA;
  readonly quantileRule: typeof P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE;
  readonly secondaryEndpointIds: readonly string[];
  readonly secondarySummaryIds: readonly string[];
  readonly collectionStatus: P63V2CalibrationState["status"];
  readonly committedAttemptCount: number;
  readonly interruptedAttemptCount: number;
  readonly maxOutputCensoredAttemptCount: number;
  readonly attempts: readonly P63V2SecondaryAttemptRow[];
  readonly logicalCells: readonly P63V2SecondaryLogicalCellRow[];
  readonly byArm: readonly P63V2ArmReliabilitySummary[];
  readonly mTaskByArm: readonly P63V2MTaskArmReliabilitySummary[];
  readonly exhaustedCellLocations: readonly {
    sequence: number;
    measurement: "M" | "Rsem";
    taskId: string | null;
    repeat: number;
    armLabel: ArmLabel;
    attempts: number;
  }[];
}

export function withP63V2SecondaryReliability(
  executor: {
    execute(cell: P63CalibrationCell, attempt: number): Promise<P63V2ReliabilityCellOutcome>;
  }
): P63V2CalibrationExecutor {
  return {
    async execute(cell, attempt): Promise<P63V2CellOutcome> {
      const outcome = await executor.execute(cell, attempt);
      assertTelemetry(outcome.reliabilityTelemetry);
      assertAutoEvidenceConsistent(outcome);
      const artifact: P63V2ReliabilityAttemptArtifact = {
        schemaVersion: P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA,
        identity: {
          sequence: cell.sequence,
          measurement: cell.measurement,
          taskId: cell.taskId,
          repeat: cell.repeat,
          armLabel: cell.arm.label,
          attempt,
        },
        telemetry: cloneTelemetry(outcome.reliabilityTelemetry),
        scientificArtifactPayload: outcome.artifactPayload,
      };
      return { ...outcome, artifactPayload: artifact };
    },
  };
}

export function summarizeP63V2SecondaryReliability(args: {
  state: P63V2CalibrationState;
  plan: readonly P63CalibrationCell[];
  loadAttemptArtifact: (artifactPath: string) => unknown;
}): P63V2SecondaryReliabilitySummary {
  const { state, plan, loadAttemptArtifact } = args;
  if (plan.length !== state.totalLogicalCells) {
    throw new Error("P6-3 v2 reliability summary refused: plan length does not match state");
  }
  const planBySequence = new Map(plan.map((cell) => [cell.sequence, cell]));
  if (planBySequence.size !== plan.length) {
    throw new Error("P6-3 v2 reliability summary refused: duplicate plan sequence");
  }

  const seenAttemptKeys = new Set<string>();
  const attemptRows: P63V2SecondaryAttemptRow[] = state.attempts.map((record) => {
    const key = `${record.sequence}:${record.attempt}`;
    if (seenAttemptKeys.has(key)) {
      throw new Error(`P6-3 v2 reliability summary refused: duplicate attempt ${key}`);
    }
    seenAttemptKeys.add(key);
    const cell = planBySequence.get(record.sequence);
    if (!cell) throw new Error(`P6-3 v2 reliability summary refused: unknown sequence ${record.sequence}`);
    if (!record.artifactPath) {
      throw new Error(`P6-3 v2 reliability summary refused: attempt ${key} has no committed artifact`);
    }
    const artifact = parseAttemptArtifact(loadAttemptArtifact(record.artifactPath));
    assertArtifactIdentity(record, artifact);
    const telemetry = artifact.telemetry;
    const maxOutputCensored =
      record.executionStatus === "response-incomplete" &&
      telemetry.incompleteReason === "max_output_tokens" &&
      telemetry.tokenUsage.output !== null &&
      telemetry.configuredMaxOutputTokens !== null &&
      telemetry.tokenUsage.output === telemetry.configuredMaxOutputTokens;
    if (maxOutputCensored && record.effectiveFailureDomain !== "infrastructure") {
      throw new Error(`P6-3 v2 reliability summary refused: exact-cap censoring is not infrastructure for ${key}`);
    }
    if (
      maxOutputCensored &&
      (
        record.autoInfrastructureClassification?.disposition !== "infrastructure-invalid" ||
        record.autoInfrastructureClassification.ruleId !== P6_3_V2_AUTO_INFRA_MAX_OUTPUT_RULE_ID
      )
    ) {
      throw new Error(`P6-3 v2 reliability summary refused: exact-cap censoring lacks frozen AUTO-INFRA classification for ${key}`);
    }
    return {
      sequence: record.sequence,
      measurement: record.measurement,
      taskId: record.taskId,
      repeat: record.repeat,
      armLabel: record.armLabel,
      attempt: record.attempt,
      executionStatus: record.executionStatus,
      effectiveFailureDomain: record.effectiveFailureDomain,
      maxOutputCensored,
      outputTokens: telemetry.tokenUsage.output,
      reasoningOutputTokens: telemetry.tokenUsage.reasoningOutput,
      inputTokens: telemetry.tokenUsage.input,
      totalTokens: telemetry.tokenUsage.total,
      configuredMaxOutputTokens: telemetry.configuredMaxOutputTokens,
      incompleteReason: telemetry.incompleteReason,
    };
  }).sort((a, b) => a.sequence - b.sequence || a.attempt - b.attempt);

  const exhaustedBySequence = new Map(state.exhaustedCells.map((item) => [item.sequence, item]));
  if (exhaustedBySequence.size !== state.exhaustedCells.length) {
    throw new Error("P6-3 v2 reliability summary refused: duplicate exhausted-cell sequence");
  }
  const terminal = state.status === "completed" || state.status === "needs-design-audit";
  const logicalCells: P63V2SecondaryLogicalCellRow[] = plan.map((cell) => {
    const attempts = attemptRows.filter((row) => row.sequence === cell.sequence);
    const scientific = attempts.find((row) => isScientificObservation(row.effectiveFailureDomain));
    const exhausted = exhaustedBySequence.has(cell.sequence);
    if (terminal && attempts.length === 0) {
      throw new Error(`P6-3 v2 reliability summary refused: terminal collection has unattempted cell ${cell.sequence}`);
    }
    if (terminal && !scientific && !exhausted) {
      throw new Error(`P6-3 v2 reliability summary refused: terminal cell ${cell.sequence} has neither observation nor exhaustion`);
    }
    return {
      sequence: cell.sequence,
      measurement: cell.measurement,
      taskId: cell.taskId,
      repeat: cell.repeat,
      armLabel: cell.arm.label,
      attemptCount: attempts.length,
      anyMaxOutputCensoring: attempts.some((row) => row.maxOutputCensored),
      attemptsToValidScientificObservation: scientific?.attempt ?? null,
      censoredExhausted: exhausted,
    };
  });

  const byArm = ARM_ORDER.map((armLabel) => {
    const attempts = attemptRows.filter((row) => row.armLabel === armLabel);
    const cells = logicalCells.filter((row) => row.armLabel === armLabel && row.attemptCount > 0);
    const censoredAttempts = attempts.filter((row) => row.maxOutputCensored).length;
    const censoredCells = cells.filter((row) => row.anyMaxOutputCensoring).length;
    return {
      armLabel,
      attempts: attempts.length,
      maxOutputCensoredAttempts: censoredAttempts,
      attemptCensoringRate: rate(censoredAttempts, attempts.length),
      attemptedLogicalCells: cells.length,
      logicalCellsWithAnyCensoring: censoredCells,
      logicalCellCensoringRate: rate(censoredCells, cells.length),
      attemptCountDistribution: distribution(cells.map((row) => row.attemptCount), 0),
      attemptsToValidScientificObservation: distribution(
        cells.flatMap((row) => row.attemptsToValidScientificObservation === null ? [] : [row.attemptsToValidScientificObservation]),
        cells.filter((row) => row.attemptsToValidScientificObservation === null).length
      ),
      outputTokens: distribution(
        attempts.flatMap((row) => row.outputTokens === null ? [] : [row.outputTokens]),
        attempts.filter((row) => row.outputTokens === null).length
      ),
      reasoningOutputTokens: distribution(
        attempts.flatMap((row) => row.reasoningOutputTokens === null ? [] : [row.reasoningOutputTokens]),
        attempts.filter((row) => row.reasoningOutputTokens === null).length
      ),
    } satisfies P63V2ArmReliabilitySummary;
  });

  const mTaskKeys = [...new Set(plan
    .filter((cell) => cell.measurement === "M" && cell.taskId !== null)
    .map((cell) => `${cell.taskId}\u0000${cell.arm.label}`))]
    .sort((a, b) => {
      const [taskA, armA] = a.split("\u0000") as [string, ArmLabel];
      const [taskB, armB] = b.split("\u0000") as [string, ArmLabel];
      return taskA.localeCompare(taskB) || ARM_ORDER.indexOf(armA) - ARM_ORDER.indexOf(armB);
    });
  const mTaskByArm = mTaskKeys.map((key) => {
    const [taskId, armLabel] = key.split("\u0000") as [string, ArmLabel];
    const attempts = attemptRows.filter(
      (row) => row.measurement === "M" && row.taskId === taskId && row.armLabel === armLabel
    );
    const cells = logicalCells.filter(
      (row) => row.measurement === "M" && row.taskId === taskId && row.armLabel === armLabel && row.attemptCount > 0
    );
    const censoredAttempts = attempts.filter((row) => row.maxOutputCensored).length;
    const censoredCells = cells.filter((row) => row.anyMaxOutputCensoring).length;
    return {
      taskId,
      armLabel,
      attempts: attempts.length,
      maxOutputCensoredAttempts: censoredAttempts,
      attemptCensoringRate: rate(censoredAttempts, attempts.length),
      attemptedLogicalCells: cells.length,
      logicalCellsWithAnyCensoring: censoredCells,
      logicalCellCensoringRate: rate(censoredCells, cells.length),
    } satisfies P63V2MTaskArmReliabilitySummary;
  });

  return {
    schemaVersion: P6_3_V2_SECONDARY_RELIABILITY_SUMMARY_SCHEMA,
    quantileRule: P6_3_V2_SECONDARY_RELIABILITY_QUANTILE_RULE,
    secondaryEndpointIds: [...P6_3_V2_SECONDARY_ENDPOINT_IDS],
    secondarySummaryIds: [...P6_3_V2_SECONDARY_SUMMARY_IDS],
    collectionStatus: state.status,
    committedAttemptCount: attemptRows.length,
    interruptedAttemptCount: state.interruptedAttempts.length,
    maxOutputCensoredAttemptCount: attemptRows.filter((row) => row.maxOutputCensored).length,
    attempts: attemptRows,
    logicalCells,
    byArm,
    mTaskByArm,
    exhaustedCellLocations: state.exhaustedCells
      .map((item) => ({
        sequence: item.sequence,
        measurement: item.measurement,
        taskId: item.taskId,
        repeat: item.repeat,
        armLabel: item.armLabel,
        attempts: item.attempts,
      }))
      .sort((a, b) => a.sequence - b.sequence),
  };
}

function parseAttemptArtifact(value: unknown): P63V2ReliabilityAttemptArtifact {
  if (!value || typeof value !== "object") {
    throw new Error("P6-3 v2 reliability artifact must be an object");
  }
  const artifact = value as Partial<P63V2ReliabilityAttemptArtifact>;
  if (artifact.schemaVersion !== P6_3_V2_SECONDARY_RELIABILITY_ARTIFACT_SCHEMA) {
    throw new Error("P6-3 v2 reliability artifact schema mismatch");
  }
  if (!artifact.identity || !artifact.telemetry) {
    throw new Error("P6-3 v2 reliability artifact missing identity/telemetry");
  }
  assertTelemetry(artifact.telemetry);
  return artifact as P63V2ReliabilityAttemptArtifact;
}

function assertArtifactIdentity(
  record: P63V2CalibrationState["attempts"][number],
  artifact: P63V2ReliabilityAttemptArtifact
): void {
  const expected = {
    sequence: record.sequence,
    measurement: record.measurement,
    taskId: record.taskId,
    repeat: record.repeat,
    armLabel: record.armLabel,
    attempt: record.attempt,
  };
  if (JSON.stringify(artifact.identity) !== JSON.stringify(expected)) {
    throw new Error(`P6-3 v2 reliability artifact identity mismatch for ${record.sequence}:${record.attempt}`);
  }
}

function assertAutoEvidenceConsistent(outcome: P63V2ReliabilityCellOutcome): void {
  const evidence = outcome.autoInfrastructureEvidence;
  if (!evidence) return;
  const telemetry = outcome.reliabilityTelemetry;
  if (
    evidence.outputTokens !== telemetry.tokenUsage.output ||
    evidence.configuredMaxOutputTokens !== telemetry.configuredMaxOutputTokens ||
    evidence.incompleteReason !== telemetry.incompleteReason
  ) {
    throw new Error("P6-3 v2 reliability telemetry disagrees with automatic-infrastructure raw evidence");
  }
}

function cloneTelemetry(value: P63V2ReliabilityTelemetry): P63V2ReliabilityTelemetry {
  return {
    tokenUsage: { ...value.tokenUsage },
    configuredMaxOutputTokens: value.configuredMaxOutputTokens,
    incompleteReason: value.incompleteReason,
  };
}

function assertTelemetry(value: P63V2ReliabilityTelemetry): void {
  if (!value || typeof value !== "object" || !value.tokenUsage) {
    throw new Error("P6-3 v2 reliability telemetry is required for every committed attempt");
  }
  for (const name of ["input", "output", "reasoningOutput", "total"] as const) {
    if (!(name in value.tokenUsage)) {
      throw new Error(`P6-3 v2 reliability telemetry is missing required token field ${name}`);
    }
    const tokenValue = value.tokenUsage[name];
    if (tokenValue !== null && (!Number.isInteger(tokenValue) || tokenValue < 0)) {
      throw new Error(`P6-3 v2 reliability telemetry ${name} must be a non-negative integer or null`);
    }
  }
  if (
    value.configuredMaxOutputTokens !== null &&
    (!Number.isInteger(value.configuredMaxOutputTokens) || value.configuredMaxOutputTokens <= 0)
  ) {
    throw new Error("P6-3 v2 configuredMaxOutputTokens must be a positive integer or null");
  }
  if (value.incompleteReason !== null && typeof value.incompleteReason !== "string") {
    throw new Error("P6-3 v2 incompleteReason must be string or null");
  }
}

function isScientificObservation(domain: string): boolean {
  return domain === "none" || domain === "semantic" || domain === "protocol" || domain === "system";
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function distribution(values: readonly number[], missing: number): P63V2DistributionSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    observed: sorted.length,
    missing,
    rawSorted: sorted,
    min: sorted.length ? sorted[0] : null,
    q25: nearestRank(sorted, 0.25),
    q50: nearestRank(sorted, 0.5),
    q75: nearestRank(sorted, 0.75),
    max: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

function nearestRank(sorted: readonly number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil(probability * sorted.length));
  return sorted[rank - 1] ?? null;
}
