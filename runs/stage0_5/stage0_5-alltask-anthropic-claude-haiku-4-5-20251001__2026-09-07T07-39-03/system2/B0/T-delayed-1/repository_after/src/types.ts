export interface Operation {
  type: string;
  [key: string]: any;
}

export interface EntityState {
  [key: string]: any;
}

export interface WorldProtocol {
  reset: (initialState?: EntityState) => void;
  applyOperation: (operation: Operation) => EntityState;
  getEntityState: (entityId: string) => any;
  toAbstractSnapshot: () => EntityState;
}
