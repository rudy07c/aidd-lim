import { OBSERVABLE_WORKING_NOTE_MAX_CHARS } from "./observable-interaction";
import {
  ArtifactUnit,
  countArtifactUnitWorkingSetTokens,
} from "../measurement/artifact-unit";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalTokens,
} from "../measurement/token-counter";

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
  reason: string;
  usageBefore: number;
  usageAfter: number;
}

export interface WorkingSetSnapshot {
  budgetTokens: number;
  activeUnits: ArtifactUnit[];
  explicitMemory: ExplicitWorkingMemory | null;
  artifactTokens: number;
  memoryTokens: number;
  currentTokenUsage: number;
  remainingBudget: number;
  cumulativeUnitAdmissionTokens: number;
  evictionHistory: WorkingSetEvictionRecord[];
  tokenCountMethod: typeof CANONICAL_TOKEN_COUNT_METHOD;
}

/**
 * Stage 1 P4 working-set budget authority for PR/AR.
 *
 * B_work counts model-visible artifact evidence, not content-only tokens. For
 * ArtifactUnit this means the canonical path + line-range + content serialization
 * defined by serializeArtifactUnitForWorkingSet(). Explicit memory is counted by
 * the same canonical tokenizer. Backend/provider truncation is not a second budget
 * authority and must remain disabled for this evidence.
 *
 * Scope of this first implementation slice:
 * - explicit ArtifactUnit admission/removal
 * - canonical B_work enforcement
 * - bounded explicit working memory
 *
 * It intentionally does NOT implement an automatic/deterministic eviction policy,
 * retrieval, reread policy, E_max, or an episodic runner. Those remain later P4/P5 work.
 */
export class WorkingSetManager {
  private readonly activeUnits = new Map<string, ArtifactUnit>();
  private explicitMemory: ExplicitWorkingMemory | null = null;
  private readonly evictionHistory: WorkingSetEvictionRecord[] = [];
  private cumulativeUnitAdmissionTokens = 0;

  constructor(readonly budgetTokens: number) {
    if (!Number.isInteger(budgetTokens) || budgetTokens <= 0) {
      throw new Error("B_work must be a positive integer token budget");
    }
  }

  addUnit(unit: ArtifactUnit): void {
    this.assertArtifactUnitCanonical(unit);
    if (this.activeUnits.has(unit.id)) {
      throw new Error(`ArtifactUnit already active: ${unit.id}`);
    }
    this.assertFits(unit.tokenCount, `ArtifactUnit ${unit.id}`);
    this.activeUnits.set(unit.id, cloneUnit(unit));
    this.cumulativeUnitAdmissionTokens += unit.tokenCount;
    this.assertInvariant();
  }

  /**
   * Explicit eviction primitive only. P4 step 4 will define the deterministic
   * policy that decides which unit(s) should be evicted automatically.
   */
  evictUnit(unitId: string, reason = "explicit-request"): ArtifactUnit {
    const unit = this.activeUnits.get(unitId);
    if (!unit) throw new Error(`Cannot evict inactive ArtifactUnit: ${unitId}`);
    const usageBefore = this.currentTokenUsage;
    this.activeUnits.delete(unitId);
    const usageAfter = this.currentTokenUsage;
    this.evictionHistory.push({
      sequence: this.evictionHistory.length,
      unitId,
      tokenCount: unit.tokenCount,
      reason,
      usageBefore,
      usageAfter,
    });
    this.assertInvariant();
    return cloneUnit(unit);
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
    const existingTokens = this.explicitMemory?.tokenCount ?? 0;
    const proposedUsage = this.currentTokenUsage - existingTokens + tokenCount;
    if (proposedUsage > this.budgetTokens) {
      throw new Error(
        `B_work exceeded by explicit memory: proposed=${proposedUsage}, budget=${this.budgetTokens}`
      );
    }
    this.explicitMemory = {
      content,
      tokenCount,
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
      maxChars: OBSERVABLE_WORKING_NOTE_MAX_CHARS,
    };
    this.assertInvariant();
  }

  hasUnit(unitId: string): boolean {
    return this.activeUnits.has(unitId);
  }

  get artifactTokens(): number {
    let total = 0;
    for (const unit of this.activeUnits.values()) total += unit.tokenCount;
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
    return {
      budgetTokens: this.budgetTokens,
      activeUnits: [...this.activeUnits.values()].map(cloneUnit),
      explicitMemory: this.explicitMemory ? { ...this.explicitMemory } : null,
      artifactTokens: this.artifactTokens,
      memoryTokens: this.memoryTokens,
      currentTokenUsage: this.currentTokenUsage,
      remainingBudget: this.remainingBudget,
      cumulativeUnitAdmissionTokens: this.cumulativeUnitAdmissionTokens,
      evictionHistory: this.evictionHistory.map((entry) => ({ ...entry })),
      tokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
    };
  }

  private assertFits(additionalTokens: number, label: string): void {
    const proposedUsage = this.currentTokenUsage + additionalTokens;
    if (proposedUsage > this.budgetTokens) {
      throw new Error(
        `B_work exceeded by ${label}: proposed=${proposedUsage}, budget=${this.budgetTokens}`
      );
    }
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
    for (const unit of this.activeUnits.values()) this.assertArtifactUnitCanonical(unit);
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
