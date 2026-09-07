export interface ZefState {
  mode: 'nim' | 'pex';
}

export interface EntityState {
  zef: ZefState;
}

export type Operation = 
  | { type: 'resetZef' }
  | { type: string; [key: string]: any };

export interface AbstractSnapshot {
  zef: 'nim' | 'pex';
  [key: string]: any;
}

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): EntityState;
  getEntityState(): EntityState;
  toAbstractSnapshot(): AbstractSnapshot;
}
