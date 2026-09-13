import { ExplorationBudget } from "../context/exploration-budget";
import { WorkingSetManager } from "../context/working-set-manager";
import { serializeArtifactUnitForWorkingSet } from "../measurement/artifact-unit";
import {
  InMemoryRepositoryAccessor,
  RepositoryAccessOperation,
  RepositoryListArgs,
  RepositoryReadChunkArgs,
  RepositorySearchArgs,
} from "./repository-accessor";

export const RETRIEVAL_GATEWAY_SCHEMA_VERSION = "retrieval-gateway-v1" as const;

export interface BudgetedRetrievalRecord {
  sequence: number;
  operation: RepositoryAccessOperation;
  label: string;
  candidateResultHash: string | null;
  candidateUnitIds: string[];
  exposedUnitIds: string[];
  admittedUnitIds: string[];
  rereadUnitIds: string[];
  alreadyActiveUnitIds: string[];
  candidateTokens: number;
  exposedTokens: number;
  workingSetTokensBefore: number;
  workingSetTokensAfter: number;
  cumulativeRetrievedTokensAfter: number;
  retrievalOperationsAfter: number;
  error: string | null;
}

export interface BudgetedRetrievalResult {
  schemaVersion: typeof RETRIEVAL_GATEWAY_SCHEMA_VERSION;
  operation: RepositoryAccessOperation;
  /** Canonical model-visible evidence admitted/re-admitted into W_t by this retrieval. */
  evidence: string[];
  record: BudgetedRetrievalRecord;
}

export interface BudgetedRepositoryGateway {
  listFiles(args?: RepositoryListArgs): Promise<BudgetedRetrievalResult>;
  search(args: RepositorySearchArgs): Promise<BudgetedRetrievalResult>;
  readChunk(args: RepositoryReadChunkArgs): Promise<BudgetedRetrievalResult>;
  records(): BudgetedRetrievalRecord[];
}

export interface BudgetedRepositoryGatewayOptions {
  repositoryFiles: Readonly<Record<string, string>>;
  explorationBudget: ExplorationBudget;
  workingSet: WorkingSetManager;
}

/**
 * P5 scientific retrieval boundary.
 *
 * Raw RepositoryAccessor reads are deliberately encapsulated here. Scientific
 * PR/AR runtime code receives only BudgetedRepositoryGateway, so every repository
 * observation follows exactly one sequence:
 *
 *   beginRetrieval() -> raw accessor -> completeRetrieval(tokens) -> W_t admission
 *
 * The accessor remains provider-neutral and budget-unaware. E_max and B_work are
 * owned by their existing authorities and are merely coordinated here.
 */
export function createBudgetedRepositoryGateway(
  options: BudgetedRepositoryGatewayOptions
): BudgetedRepositoryGateway {
  const accessor = new InMemoryRepositoryAccessor(options.repositoryFiles);
  return new BudgetedRepositoryGatewayImpl(
    accessor,
    options.explorationBudget,
    options.workingSet
  );
}

class BudgetedRepositoryGatewayImpl implements BudgetedRepositoryGateway {
  private readonly history: BudgetedRetrievalRecord[] = [];

  constructor(
    private readonly accessor: InMemoryRepositoryAccessor,
    private readonly explorationBudget: ExplorationBudget,
    private readonly workingSet: WorkingSetManager
  ) {}

  async listFiles(args: RepositoryListArgs = {}): Promise<BudgetedRetrievalResult> {
    return this.retrieve("list-files", () => this.accessor.listFiles(args));
  }

  async search(args: RepositorySearchArgs): Promise<BudgetedRetrievalResult> {
    return this.retrieve("search", () => this.accessor.search(args));
  }

  async readChunk(args: RepositoryReadChunkArgs): Promise<BudgetedRetrievalResult> {
    return this.retrieve("read-chunk", () => this.accessor.readChunk(args));
  }

  records(): BudgetedRetrievalRecord[] {
    return this.history.map(cloneRecord);
  }

  private async retrieve(
    operation: RepositoryAccessOperation,
    access: () => ReturnType<InMemoryRepositoryAccessor["listFiles"]>
  ): Promise<BudgetedRetrievalResult> {
    const label = `repository:${operation}:${this.history.length}`;
    const workingBefore = this.workingSet.snapshot();
    this.explorationBudget.beginRetrieval(label);

    let candidate: Awaited<ReturnType<InMemoryRepositoryAccessor["listFiles"]>>;
    try {
      candidate = await access();
    } catch (error) {
      // Failed repository attempts still consume one retrieval operation but expose
      // zero evidence, so close the pending E_max transaction before propagating.
      this.explorationBudget.completeRetrieval(0, label);
      const snapshot = this.explorationBudget.snapshot();
      this.pushRecord({
        operation,
        label,
        candidateResultHash: null,
        candidateUnitIds: [],
        exposedUnitIds: [],
        admittedUnitIds: [],
        rereadUnitIds: [],
        alreadyActiveUnitIds: [],
        candidateTokens: 0,
        exposedTokens: 0,
        workingSetTokensBefore: workingBefore.currentTokenUsage,
        workingSetTokensAfter: this.workingSet.currentTokenUsage,
        cumulativeRetrievedTokensAfter: snapshot.used.cumulativeRetrievedTokens,
        retrievalOperationsAfter: snapshot.used.retrievalOperations,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const activeIds = new Set(workingBefore.activeUnits.map((unit) => unit.id));
    const alreadyActiveUnitIds = candidate.units
      .filter((unit) => activeIds.has(unit.id))
      .map((unit) => unit.id);
    const exposable = candidate.units.filter((unit) => !activeIds.has(unit.id));

    // A unit that cannot ever coexist with pinned explicit memory is not exposable.
    // Close this retrieval as zero evidence rather than mutating E_max/W_t partially.
    const impossible = exposable.find(
      (unit) => unit.tokenCount + workingBefore.memoryTokens > workingBefore.budgetTokens
    );
    if (impossible) {
      this.explorationBudget.completeRetrieval(0, label);
      const snapshot = this.explorationBudget.snapshot();
      const message =
        `B_work cannot admit retrieved ArtifactUnit ${impossible.id}: ` +
        `required=${impossible.tokenCount + workingBefore.memoryTokens}, ` +
        `budget=${workingBefore.budgetTokens}`;
      this.pushRecord({
        operation,
        label,
        candidateResultHash: candidate.resultHash,
        candidateUnitIds: candidate.units.map((unit) => unit.id),
        exposedUnitIds: [],
        admittedUnitIds: [],
        rereadUnitIds: [],
        alreadyActiveUnitIds,
        candidateTokens: candidate.totalEvidenceTokens,
        exposedTokens: 0,
        workingSetTokensBefore: workingBefore.currentTokenUsage,
        workingSetTokensAfter: workingBefore.currentTokenUsage,
        cumulativeRetrievedTokensAfter: snapshot.used.cumulativeRetrievedTokens,
        retrievalOperationsAfter: snapshot.used.retrievalOperations,
        error: message,
      });
      throw new Error(message);
    }

    const remainingRetrievalTokens =
      this.explorationBudget.snapshot().remaining.cumulativeRetrievedTokens;
    const selected = deterministicTokenPrefix(exposable, remainingRetrievalTokens);
    const exposedTokens = selected.reduce((sum, unit) => sum + unit.tokenCount, 0);

    // E_max evidence accounting is finalized before any W_t mutation. Because the
    // prefix is selected from the current remaining budget, this completion cannot
    // exceed the cumulative token cap.
    this.explorationBudget.completeRetrieval(exposedTokens, label);

    const admittedUnitIds: string[] = [];
    const rereadUnitIds: string[] = [];
    for (const unit of selected) {
      if (this.workingSet.wasEverAdmitted(unit.id)) {
        this.workingSet.rereadUnit(unit);
        rereadUnitIds.push(unit.id);
      } else {
        this.workingSet.addUnit(unit);
        admittedUnitIds.push(unit.id);
      }
    }

    const workingAfter = this.workingSet.snapshot();
    const explorationAfter = this.explorationBudget.snapshot();
    const record = this.pushRecord({
      operation,
      label,
      candidateResultHash: candidate.resultHash,
      candidateUnitIds: candidate.units.map((unit) => unit.id),
      exposedUnitIds: selected.map((unit) => unit.id),
      admittedUnitIds,
      rereadUnitIds,
      alreadyActiveUnitIds,
      candidateTokens: candidate.totalEvidenceTokens,
      exposedTokens,
      workingSetTokensBefore: workingBefore.currentTokenUsage,
      workingSetTokensAfter: workingAfter.currentTokenUsage,
      cumulativeRetrievedTokensAfter: explorationAfter.used.cumulativeRetrievedTokens,
      retrievalOperationsAfter: explorationAfter.used.retrievalOperations,
      error: null,
    });

    return {
      schemaVersion: RETRIEVAL_GATEWAY_SCHEMA_VERSION,
      operation,
      evidence: selected.map((unit) => serializeArtifactUnitForWorkingSet(unit)),
      record: cloneRecord(record),
    };
  }

  private pushRecord(
    record: Omit<BudgetedRetrievalRecord, "sequence">
  ): BudgetedRetrievalRecord {
    const complete: BudgetedRetrievalRecord = {
      sequence: this.history.length,
      ...record,
    };
    this.history.push(complete);
    return complete;
  }
}

function deterministicTokenPrefix<T extends { tokenCount: number }>(
  units: readonly T[],
  tokenBudget: number
): T[] {
  const selected: T[] = [];
  let used = 0;
  for (const unit of units) {
    if (used + unit.tokenCount > tokenBudget) break;
    selected.push(unit);
    used += unit.tokenCount;
  }
  return selected;
}

function cloneRecord(record: BudgetedRetrievalRecord): BudgetedRetrievalRecord {
  return {
    ...record,
    candidateUnitIds: [...record.candidateUnitIds],
    exposedUnitIds: [...record.exposedUnitIds],
    admittedUnitIds: [...record.admittedUnitIds],
    rereadUnitIds: [...record.rereadUnitIds],
    alreadyActiveUnitIds: [...record.alreadyActiveUnitIds],
  };
}
