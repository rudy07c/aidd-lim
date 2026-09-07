export interface GameState {
  fen: string;
  [key: string]: any;
}

export interface Operation {
  type: string;
  name?: string;
  data?: any;
  [key: string]: any;
}

export interface AbstractSnapshot {
  fen: string;
  [key: string]: any;
}

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): void;
  getEntityState(): GameState;
  toAbstractSnapshot(): AbstractSnapshot;
}
