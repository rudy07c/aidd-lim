export interface EntityState {
  state: string;
  [key: string]: any;
}

export interface Operation {
  type: string;
  [key: string]: any;
}

export interface AbstractSnapshot {
  entities: Record<string, EntityState>;
  timestamp: number;
}

export interface WorldProtocol {
  reset(): void;
  applyOperation(op: Operation): void;
  getEntityState(entityName: string): EntityState | undefined;
  toAbstractSnapshot(): AbstractSnapshot;
}
