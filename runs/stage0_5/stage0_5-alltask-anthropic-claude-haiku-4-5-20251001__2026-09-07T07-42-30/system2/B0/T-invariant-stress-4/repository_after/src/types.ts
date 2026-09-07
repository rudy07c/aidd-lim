export interface EntityState {
  entity: string;
  state: string;
}

export type OperationType = 'moveVok' | 'moveZef' | 'turboVokZef';

export interface Operation {
  type: OperationType;
  target: string;
}

export interface AbstractSnapshot {
  vok: string;
  zef: string;
  [key: string]: string;
}

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (op: Operation) => void;
  getEntityState: (entity: string) => EntityState;
  toAbstractSnapshot: () => AbstractSnapshot;
}
