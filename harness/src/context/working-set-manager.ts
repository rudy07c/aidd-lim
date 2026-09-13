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

type WorkingSetEvictionTrigger =
  | "artifact-admission"
  | "artifact-reread"
  | "explicit-memory-update"
  | "explicit-request";

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
  trigger: WorkingSetEvictionTrigger;
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
  uniqueAdmittedUnitCount: number;
  totalAdmissionCount: number;
  rereadCount: number;
  cumulativeRereadTokens: number;
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
 * P4 step 5 enables explicit reread/re-admission through rereadUnit(). A reread
 * is legal only for a previously admitted, currently inactive ArtifactUnit whose
 * identity/evidence exactly matches its first admission. Successful reread gets
 * a fresh admission sequence and therefore becomes the newest FIFO entry. It
 * counts again toward cumulative admission/retrieval tokens but does not create
 * a new unique unit. Rereading an already-active unit is rejected and does not
 * refresh FIFO age.
 *
 * An incoming unit that cannot fit even after evicting every active artifact
 * unit (because the unit + pinned memory alone exceeds B_work) is rejected before
 * any eviction occurs. Likewise, explicit memory whose own token count exceeds
 * B_work is rejected atomically.
 */
export class WorkingSetManager {
  private readonly activeUnits = new Map<string, ActiveUnitEntry>();
  private readonly everAdmittedUnits = new Map<string, ArtifactUnit>();
  private explicitMemory: ExplicitWorkingMemory | null = null;
  private readonly evictionHistory: WorkingSetEvictionRecord[] = [];
  private cumulativeUnitAdmissionTokens = 0;
  private rereadCount = 0;
  private cumulativeRereadTokens = 0;
  private nextAdmissionSequence = 0;

  constructor(readonly budgetTokens: number) {
    if (!Number.isInteger(budgetTokens) || budgetTokens <= 0) {
      throw new Error("B_work must be a positive integer token budget");
    }
  }

  /** First exposure of an ArtifactUnit. */
  addUnit(unit: ArtifactUnit): void {
    this.assertArtifactUnitCanonical(unit);
    if (this.activeUnits.has(unit.id)) {
      throw new Error(`ArtifactUnit already active: ${unit.id}`);
    }
    if (this.everAdmittedUnits.has(unit.id)) {
      throw new Error(
        `ArtifactUnit was previously admitted: ${unit.id}; use rereadUnit() for re-exposure`
      );
    }

    this.assertFitsWithPinnedMemory(unit);
    const victims = this.planFifoEvictions(this.currentTokenUsage + unit.tokenCount);
    this.applyFifoEvictions(victims, "artifact-admission", unit.id);
    this.installActiveUnit(unit);
    this.everAdmittedUnits.set(unit.id, cloneUnit(unit));
    this.cumulativeUnitAdmissionTokens += unit.tokenCount;
    this.assertInvariant();
  }

  /** Re-exposure of previously admitted evidence after eviction. */
  rereadUnit(unit: ArtifactUnit): void {
    this.assertArtifactUnitCanonical(unit);
    if (this.activeUnits.has(unit.id)) {
      throw new Error(
        `Cannot reread active ArtifactUnit: ${unit.id}; active reread does not refresh FIFO admission age`
      );
    }

    const firstAdmission = this.everAdmittedUnits.get(unit.id);
    if (!firstAdmission) {
      throw new Error(
        `Cannot reread ArtifactUnit before first admission: ${unit.id}; use addUnit() for first exposure`
      );
    }
    this.assertRereadIdentity(firstAdmission, unit);
    this.assertFitsWithPinnedMemory(unit);

    const victims = this.planFifoEvictions(this.currentTokenUsage + unit.tokenCount);
    this.applyFifoEvictions(victims, "artifact-reread", unit.id);
    this.installActiveUnit(unit);
    this.cumulativeUnitAdmissionTokens += unit.tokenCount;
    this.rereadCount += 1;
    this.cumulativeRereadTokens += unit.tokenCount;
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

    this.applyFifoEvictions(victims, "explicit-memory-update", null);
    this.explicitMemory = nextMemory;
    this.assertInvariant();
  }

  hasUnit(unitId: string): boolean {
    return this.activeUnits.has(unitId);
  }

  /**
   * Read-only history query for the P5 retrieval gateway. This does not expose
   * evidence contents; it only lets the gateway route a repository observation
   * through addUnit() versus rereadUnit() without exception-driven control flow.
   */
  wasEverAdmitted(unitId: string): boolean {
    return this.everAdmittedUnits.has(unitId);
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
      uniqueAdmittedUnitCount: this.everAdmittedUnits.size,
      totalAdmissionCount: this.nextAdmissionSequence,
      rereadCount: this.rereadCount,
      cumulativeRereadTokens: this.cumulativeRereadTokens,
      evictionPolicy: WORKING_SET_EVICTION_POLICY,
      evictionHistory: this.evictionHistory.map((entry) => ({ ...entry })),
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
    };
  }

  private installActiveUnit(unit: ArtifactUnit): void {
    const entry: ActiveUnitEntry = {
      unit: cloneUnit(unit),
      admissionSequence: this.nextAdmissionSequence,
    };
    this.nextAdmissionSequence += 1;
    this.activeUnits.set(unit.id, entry);
  }

  private assertFitsWithPinnedMemory(unit: ArtifactUnit): void {
    const irreducibleUsage = this.memoryTokens + unit.tokenCount;
    if (irreducibleUsage > this.budgetTokens) {
      throw new Error(
        `B_work cannot fit ArtifactUnit ${unit.id} with pinned explicit memory: ` +
        `required=${irreducibleUsage}, budget=${this.budgetTokens}`
      );
    }
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
    trigger: "artifact-admission" | "artifact-reread" | "explicit-memory-update",
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
    trigger: WorkingSetEvictionTrigger,
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

  private assertRereadIdentity(firstAdmission: ArtifactUnit, reread: ArtifactUnit): void {
    const fields: Array<keyof ArtifactUnit> = [
      "id",
      "path",
      "startLine",
      "endLine",
      "content",
      "tokenCount",
      "kind",
    ];
    for (const field of fields) {
      if (firstAdmission[field] !== reread[field]) {
        throw new Error(
          `ArtifactUnit reread identity mismatch for ${reread.id}: field=${field}`
        );
      }
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
      const firstAdmission = this.everAdmittedUnits.get(entry.unit.id);
      if (!firstAdmission) {
        throw new Error(`WorkingSetManager active unit missing admission history: ${entry.unit.id}`);
      }
      this.assertRereadIdentity(firstAdmission, entry.unit);
    }

    if (this.rereadCount < 0 || this.cumulativeRereadTokens < 0) {
      throw new Error("WorkingSetManager reread accounting invariant violated");
    }
    if (this.rereadCount > this.nextAdmissionSequence) {
      throw new Error("WorkingSetManager reread count exceeds total admissions");
    }
    if (this.currentTokenUsage > this.budgetTokens) {
      throw new Error(
        `WorkingSetManager invariant violated: usage=${this.currentTokenUsage}, budget=${this.budgetTokens}`
      );
    }
    if (this.remainingBudget !== this.budgetTokens - this.currentTokenUsage) {
      throw new Error("WorkingSetManager remaining-budget invariant violated");
    }
    for (const [id, unit] of this.everAdmittedUnits.entries()) {
      if (id !== unit.id) throw new Error("WorkingSetManager admission history key drifted");
      this.assertArtifactUnitCanonical(unit);
    }
  }
}

function cloneUnit(unit: ArtifactUnit): ArtifactUnit {
  return { ...unit };
}
