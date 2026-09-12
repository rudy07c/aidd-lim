import { OBSERVABLE_WORKING_NOTE_MAX_CHARS } from "./observable-interaction";
import {
  ArtifactUnit,
  countArtifactUnitWorkingSetTokens,
} from "../measurement/artifact-unit";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "../measurement/token-counter";

export const WORKING_SET_EVICTION_POLICY = "fifo-v1" as const;

export interface ExplicitWorkingMemory {
  content: string;
  tokenCount: number;
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
  maxChars: typeof OBSERVABLE_WORKING_NOTE_MAX_CHARS;
}

export interface WorkingSetEvictionRecord {
  sequence: number;
  unitId: string;
  tokenCount: number;
  admissionSequence: number;
  policy: typeof WORKING_SET_EVICTION_POLICY | "explicit";
  trigger: "artifact-admission" | "explicit-memory-update" | "explicit-request";
  triggerUnitId: string | null;
  reason: string;
  usageBefore: number;
  usageAfter: number;
}

export interface WorkingSetSnapshot {
  budgetTokens: number;
  activeUnits: ArtifactUnit[];
  activeUnitAdmissionOrder: Array<{
    unitId: string;
    admissionSequence: number;
  }>;
  explicitMemory: ExplicitWorkingMemory | null;
  artifactTokens: number;
  memoryTokens: number;
  currentTokenUsage: number;
  remainingBudget: number;
  cumulativeUnitAdmissionTokens: number;
  evictionPolicy: typeof WORKING_SET_EVICTION_POLICY;
  evictionHistory: WorkingSetEvictionRecord[];
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
}

interface ActiveUnitEntry {
  unit: ArtifactUnit;
  admissionSequence: number;
}

/**
 * Stage 1 P4 working-set budget authority for PR/AR.
 *
 * B_work counts model-visible artifact evidence, not content-only tokens. For
 * ArtifactUnit this means the canonical serialization defined by
 * serializeArtifactUnitForWorkingSet(). Explicit memory is counted by the same
 * canonical tokenizer. Backend/provider truncation is not a second budget
 * authority and must remain disabled for this evidence.
 *
 * P4 step 4 freezes one common deterministic eviction policy for PR/AR:
 * FIFO-v1. When a new ArtifactUnit would overflow B_work, the oldest admitted
 * active ArtifactUnit(s) are evicted until the incoming unit fits. Explicit
 * working memory is persistent/pinned: it counts against B_work but is never an
 * eviction victim. Increasing explicit memory may deterministically evict FIFO
 * artifact units to preserve the same invariant.
 *
 * An incoming unit that cannot fit even after evicting every active artifact
 * unit (because the unit + pinned memory alone exceeds B_work) is rejected before
 * any eviction occurs. Likewise, explicit memory whose own token count exceeds
 * B_work is rejected atomically.
 *
 * Reread/re-admission semantics, E_max, retrieval, and the episodic runner remain
 * intentionally out of scope until later P4/P5 steps.
 */
export class WorkingSetManager {
  private readonly activeUnits = new Map<string, ActiveUnitEntry>();
  private readonly everAdmittedUnitIds = new Set<string>();
  private explicitMemory: ExplicitWorkingMemory | null = null;
  private readonly evictionHistory: WorkingSetEvictionRecord[] = [];
  private cumulativeUnitAdmissionTokens = 0;
  private nextAdmissionSequence = 0;

  constructor(readonly budgetTokens: number) {
    if (!Number.isInteger(budgetTokens) || budgetTokens <= 0) {
      throw new Error("B_work must be a positive integer token budget");
    }
  }

  /**
   * Scientific admission path. Capacity pressure is resolved only by FIFO-v1.
   * A previously evicted id cannot be re-admitted yet; step 5 will define reread
   * semantics explicitly rather than inheriting them accidentally from addUnit().
   */
  addUnit(unit: ArtifactUnit): void {
    this.assertArtifactUnitCanonical(unit);
    if (this.activeUnits.has(unit.id)) {
      throw new Error(`ArtifactUnit already active: ${unit.id}`);
    }
    if (this.everAdmittedUnitIds.has(unit.id)) {
      throw new Error(
        `ArtifactUnit was previously admitted: ${unit.id}; reread semantics are not enabled before P4 step 5`
      );
    }

    const irreducibleUsage = this.memoryTokens + unit.tokenCount;
    if (irreducibleUsage > this.budgetTokens) {
      throw new Error(
        `B_work cannot fit ArtifactUnit ${unit.id} with pinned explicit memory: ` +
        `required=${irreducibleUsage}, budget=${this.budgetTokens}`
      );
    }

    const victims = this.planFifoEvictions(this.currentTokenUsage + unit.tokenCount);
    this.applyFifoEvictions(victims, "artifact-admission", unit.id);

    const entry: ActiveUnitEntry = {
      unit: cloneUnit(unit),
      admissionSequence: this.nextAdmissionSequence,
    };
    this.nextAdmissionSequence += 1;
    this.activeUnits.set(unit.id, entry);
    this.everAdmittedUnitIds.add(unit.id);
    this.cumulativeUnitAdmissionTokens += unit.tokenCount;
    this.assertInvariant();
  }

  /**
   * Harness/controller-only explicit primitive retained for diagnostics. It is
   * not the scientific PR/AR eviction policy and must not be exposed as an
   * agent-selectable victim choice. Scientific capacity pressure uses FIFO-v1.
   */
  evictUnit(unitId: string, reason = "explicit-request"): ArtifactUnit {
    const entry = this.activeUnits.get(unitId);
    if (!entry) throw new Error(`Cannot evict inactive ArtifactUnit: ${unitId}`);
    return this.removeActiveEntry(
      entry,
      "explicit",
      "explicit-request",
      null,
      reason
    );
  }

  setExplicitMemory(content: string | null): void {
    if (content === null) {
      this.explicitMemory = null;
      this.assertInvariant();
      return;
    }
    if (content.length > OBSERVABLE_WORKING_NOTE_MAX_CHARS) {
      throw new Error(
        `Explicit working memory exceeds ${OBSERVABLE_WORKING_NOTE_MAX_CHARS} characters`
      );
    }

    const tokenCount = countCanonicalTokens(content);
    if (tokenCount > this.budgetTokens) {
      throw new Error(
        `B_work cannot fit explicit memory: required=${tokenCount}, budget=${this.budgetTokens}`
      );
    }

    const nextMemory: ExplicitWorkingMemory = {
      content,
      tokenCount,
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
      maxChars: OBSERVABLE_WORKING_NOTE_MAX_CHARS,
    };
    const victims = this.planFifoEvictions(this.artifactTokens + tokenCount);

    // Install the validated/pinned memory before recording evictions so
    // usageBefore/usageAfter reflect the effective state that triggered them.
    this.explicitMemory = nextMemory;
    this.applyFifoEvictions(victims, "explicit-memory-update", null);
    this.assertInvariant();
  }

  hasUnit(unitId: string): boolean {
    return this.activeUnits.has(unitId);
  }

  get artifactTokens(): number {
    let total = 0;
    for (const entry of this.activeUnits.values()) total += entry.unit.tokenCount;
    return total;
  }

  get memoryTokens(): number {
    return this.explicitMemory?.tokenCount ?? 0;
  }

  get currentTokenUsage(): number {
    return this.artifactTokens + this.memoryTokens;
  }

  get remainingBudget(): number {
    return this.budgetTokens - this.currentTokenUsage;
  }

  snapshot(): WorkingSetSnapshot {
    this.assertInvariant();
    const orderedEntries = this.orderedActiveEntries();
    return {
      budgetTokens: this.budgetTokens,
      activeUnits: orderedEntries.map((entry) => cloneUnit(entry.unit)),
      activeUnitAdmissionOrder: orderedEntries.map((entry) => ({
        unitId: entry.unit.id,
        admissionSequence: entry.admissionSequence,
      })),
      explicitMemory: this.explicitMemory ? { ...this.explicitMemory } : null,
      artifactTokens: this.artifactTokens,
      memoryTokens: this.memoryTokens,
      currentTokenUsage: this.currentTokenUsage,
      remainingBudget: this.remainingBudget,
      cumulativeUnitAdmissionTokens: this.cumulativeUnitAdmissionTokens,
      evictionPolicy: WORKING_SET_EVICTION_POLICY,
      evictionHistory: this.evictionHistory.map((entry) => ({ ...entry })),
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
    };
  }

  private planFifoEvictions(projectedUsage: number): ActiveUnitEntry[] {
    if (projectedUsage <= this.budgetTokens) return [];
    let tokensToFree = projectedUsage - this.budgetTokens;
    const victims: ActiveUnitEntry[] = [];
    for (const entry of this.orderedActiveEntries()) {
      victims.push(entry);
      tokensToFree -= entry.unit.tokenCount;
      if (tokensToFree <= 0) break;
    }
    if (tokensToFree > 0) {
      throw new Error(
        `WorkingSetManager could not free enough FIFO artifact capacity: remaining=${tokensToFree}`
      );
    }
    return victims;
  }

  private applyFifoEvictions(
    victims: ActiveUnitEntry[],
    trigger: "artifact-admission" | "explicit-memory-update",
    triggerUnitId: string | null
  ): void {
    for (const victim of victims) {
      this.removeActiveEntry(
        victim,
        WORKING_SET_EVICTION_POLICY,
        trigger,
        triggerUnitId,
        `fifo-capacity:${trigger}`
      );
    }
  }

  private removeActiveEntry(
    entry: ActiveUnitEntry,
    policy: typeof WORKING_SET_EVICTION_POLICY | "explicit",
    trigger: "artifact-admission" | "explicit-memory-update" | "explicit-request",
    triggerUnitId: string | null,
    reason: string
  ): ArtifactUnit {
    const current = this.activeUnits.get(entry.unit.id);
    if (!current || current.admissionSequence !== entry.admissionSequence) {
      throw new Error(`WorkingSetManager eviction target drifted: ${entry.unit.id}`);
    }
    const usageBefore = this.currentTokenUsage;
    this.activeUnits.delete(entry.unit.id);
    const usageAfter = this.currentTokenUsage;
    this.evictionHistory.push({
      sequence: this.evictionHistory.length,
      unitId: entry.unit.id,
      tokenCount: entry.unit.tokenCount,
      admissionSequence: entry.admissionSequence,
      policy,
      trigger,
      triggerUnitId,
      reason,
      usageBefore,
      usageAfter,
    });
    return cloneUnit(entry.unit);
  }

  private orderedActiveEntries(): ActiveUnitEntry[] {
    return [...this.activeUnits.values()].sort(
      (a, b) => a.admissionSequence - b.admissionSequence
    );
  }

  private assertArtifactUnitCanonical(unit: ArtifactUnit): void {
    const canonical = countArtifactUnitWorkingSetTokens(unit);
    if (unit.tokenCount !== canonical) {
      throw new Error(
        `ArtifactUnit tokenCount mismatch for ${unit.id}: declared=${unit.tokenCount}, canonical=${canonical}`
      );
    }
  }

  private assertInvariant(): void {
    if (this.explicitMemory) {
      if (this.explicitMemory.content.length > OBSERVABLE_WORKING_NOTE_MAX_CHARS) {
        throw new Error("Explicit working memory character bound violated");
      }
      const canonical = countCanonicalTokens(this.explicitMemory.content);
      if (canonical !== this.explicitMemory.tokenCount) {
        throw new Error("Explicit working memory tokenCount mismatch");
      }
    }

    const seenAdmissionSequences = new Set<number>();
    for (const entry of this.activeUnits.values()) {
      this.assertArtifactUnitCanonical(entry.unit);
      if (seenAdmissionSequences.has(entry.admissionSequence)) {
        throw new Error("WorkingSetManager duplicate admission sequence");
      }
      seenAdmissionSequences.add(entry.admissionSequence);
      if (!this.everAdmittedUnitIds.has(entry.unit.id)) {
        throw new Error(`WorkingSetManager active unit missing admission history: ${entry.unit.id}`);
      }
    }

    if (this.currentTokenUsage > this.budgetTokens) {
      throw new Error(
        `WorkingSetManager invariant violated: usage=${this.currentTokenUsage}, budget=${this.budgetTokens}`
      );
    }
  }
}

function cloneUnit(unit: ArtifactUnit): ArtifactUnit {
  return { ...unit };
}
