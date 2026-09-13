export const EXPLORATION_BUDGET_SCHEMA_VERSION = "exploration-budget-v1" as const;

export interface ExplorationLimits {
  /** Comparable PR/AR repository evidence acquisition attempts. */
  maxRetrievalOperations: number;
  /** Canonical model-visible evidence tokens exposed across the whole episode. */
  maxCumulativeRetrievedTokens: number;
  /** Provider/model inference calls attempted during the episode. */
  maxModelCalls: number;
  /** High-level agent/controller decision rounds. */
  maxDecisionRounds: number;
}

export interface ExplorationUsage {
  retrievalOperations: number;
  cumulativeRetrievedTokens: number;
  modelCalls: number;
  decisionRounds: number;
}

export type ExplorationEventKind =
  | "retrieval-attempt"
  | "model-call"
  | "decision-round";

export interface ExplorationEvent {
  sequence: number;
  kind: ExplorationEventKind;
  label: string | null;
  delta: ExplorationUsage;
  usageBefore: ExplorationUsage;
  usageAfter: ExplorationUsage;
}

export interface ExplorationBudgetSnapshot {
  schemaVersion: typeof EXPLORATION_BUDGET_SCHEMA_VERSION;
  limits: ExplorationLimits;
  used: ExplorationUsage;
  remaining: ExplorationUsage;
  exhausted: Array<keyof ExplorationUsage>;
  events: ExplorationEvent[];
}

const ZERO_USAGE: ExplorationUsage = {
  retrievalOperations: 0,
  cumulativeRetrievedTokens: 0,
  modelCalls: 0,
  decisionRounds: 0,
};

/**
 * P4 Step 6 authority for E_max, deliberately separate from B_work.
 *
 * B_work limits simultaneous model-visible evidence retained in WorkingSetManager.
 * E_max limits episode-level exploration / compute opportunity so finite working
 * memory cannot be bypassed by unlimited paging. PR and AR must receive the same
 * ExplorationLimits in scientific comparisons.
 *
 * Scientific limits are deterministic counters. Wall-clock is intentionally not
 * a binding E_max dimension because machine/provider latency would become an
 * experimental variable; latency may still be logged separately as provenance.
 *
 * Retrieval accounting is defined over attempts that are about to become
 * model-visible. A trusted repository accessor may construct a candidate result
 * internally, but recordRetrievalAttempt() must succeed before that result is
 * exposed to the worker. Failed/empty retrievals pass retrievedTokens=0 and still
 * consume one retrieval operation, preventing free retries.
 *
 * Model-call and decision-round counters are consumed before the corresponding
 * external inference/round begins. All updates are fail-closed and atomic: if any
 * dimension would exceed its limit, no E_max state is changed.
 *
 * Numeric scientific limits are intentionally not hard-coded here. P6
 * recalibration freezes values that are normally non-binding while remaining the
 * same for PR and AR.
 */
export class ExplorationBudget {
  private usage: ExplorationUsage = { ...ZERO_USAGE };
  private readonly events: ExplorationEvent[] = [];

  constructor(readonly limits: ExplorationLimits) {
    validateLimits(limits);
  }

  /**
   * Count one repository-evidence acquisition attempt plus the evidence tokens
   * that will actually be exposed to the worker. retrievedTokens must use the
   * same canonical model-visible accounting contract as ArtifactUnit/B_work.
   */
  recordRetrievalAttempt(retrievedTokens: number, label?: string): void {
    assertNonNegativeInteger(retrievedTokens, "retrievedTokens");
    this.consume(
      "retrieval-attempt",
      {
        retrievalOperations: 1,
        cumulativeRetrievedTokens: retrievedTokens,
        modelCalls: 0,
        decisionRounds: 0,
      },
      label
    );
  }

  /** Consume before issuing a provider/model inference call. */
  recordModelCall(label?: string): void {
    this.consume(
      "model-call",
      {
        retrievalOperations: 0,
        cumulativeRetrievedTokens: 0,
        modelCalls: 1,
        decisionRounds: 0,
      },
      label
    );
  }

  /** Consume before starting a high-level decision round. */
  recordDecisionRound(label?: string): void {
    this.consume(
      "decision-round",
      {
        retrievalOperations: 0,
        cumulativeRetrievedTokens: 0,
        modelCalls: 0,
        decisionRounds: 1,
      },
      label
    );
  }

  snapshot(): ExplorationBudgetSnapshot {
    const used = cloneUsage(this.usage);
    const remaining: ExplorationUsage = {
      retrievalOperations: this.limits.maxRetrievalOperations - used.retrievalOperations,
      cumulativeRetrievedTokens:
        this.limits.maxCumulativeRetrievedTokens - used.cumulativeRetrievedTokens,
      modelCalls: this.limits.maxModelCalls - used.modelCalls,
      decisionRounds: this.limits.maxDecisionRounds - used.decisionRounds,
    };
    const exhausted = (Object.keys(used) as Array<keyof ExplorationUsage>).filter(
      (key) => remaining[key] === 0
    );
    return {
      schemaVersion: EXPLORATION_BUDGET_SCHEMA_VERSION,
      limits: { ...this.limits },
      used,
      remaining,
      exhausted,
      events: this.events.map((event) => ({
        ...event,
        delta: cloneUsage(event.delta),
        usageBefore: cloneUsage(event.usageBefore),
        usageAfter: cloneUsage(event.usageAfter),
      })),
    };
  }

  private consume(kind: ExplorationEventKind, delta: ExplorationUsage, label?: string): void {
    validateUsage(delta, "delta");
    const before = cloneUsage(this.usage);
    const after: ExplorationUsage = {
      retrievalOperations: before.retrievalOperations + delta.retrievalOperations,
      cumulativeRetrievedTokens:
        before.cumulativeRetrievedTokens + delta.cumulativeRetrievedTokens,
      modelCalls: before.modelCalls + delta.modelCalls,
      decisionRounds: before.decisionRounds + delta.decisionRounds,
    };
    this.assertWithinLimits(after, kind);

    // Mutation happens only after every dimension has passed validation.
    this.usage = after;
    this.events.push({
      sequence: this.events.length,
      kind,
      label: label ?? null,
      delta: cloneUsage(delta),
      usageBefore: before,
      usageAfter: cloneUsage(after),
    });
  }

  private assertWithinLimits(next: ExplorationUsage, kind: ExplorationEventKind): void {
    const violations: string[] = [];
    if (next.retrievalOperations > this.limits.maxRetrievalOperations) {
      violations.push(
        `retrievalOperations=${next.retrievalOperations}/${this.limits.maxRetrievalOperations}`
      );
    }
    if (next.cumulativeRetrievedTokens > this.limits.maxCumulativeRetrievedTokens) {
      violations.push(
        `cumulativeRetrievedTokens=${next.cumulativeRetrievedTokens}/${this.limits.maxCumulativeRetrievedTokens}`
      );
    }
    if (next.modelCalls > this.limits.maxModelCalls) {
      violations.push(`modelCalls=${next.modelCalls}/${this.limits.maxModelCalls}`);
    }
    if (next.decisionRounds > this.limits.maxDecisionRounds) {
      violations.push(`decisionRounds=${next.decisionRounds}/${this.limits.maxDecisionRounds}`);
    }
    if (violations.length > 0) {
      throw new Error(`E_max exceeded by ${kind}: ${violations.join(", ")}`);
    }
  }
}

function validateLimits(limits: ExplorationLimits): void {
  assertPositiveInteger(limits.maxRetrievalOperations, "maxRetrievalOperations");
  assertPositiveInteger(limits.maxCumulativeRetrievedTokens, "maxCumulativeRetrievedTokens");
  assertPositiveInteger(limits.maxModelCalls, "maxModelCalls");
  assertPositiveInteger(limits.maxDecisionRounds, "maxDecisionRounds");
}

function validateUsage(usage: ExplorationUsage, label: string): void {
  assertNonNegativeInteger(usage.retrievalOperations, `${label}.retrievalOperations`);
  assertNonNegativeInteger(
    usage.cumulativeRetrievedTokens,
    `${label}.cumulativeRetrievedTokens`
  );
  assertNonNegativeInteger(usage.modelCalls, `${label}.modelCalls`);
  assertNonNegativeInteger(usage.decisionRounds, `${label}.decisionRounds`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function cloneUsage(usage: ExplorationUsage): ExplorationUsage {
  return { ...usage };
}
