export interface Entity {
  name: string;
  location: string;
  [key: string]: any;
}

export interface WorldState {
  entities: Entity[];
  [key: string]: any;
}

export interface OperationValidation {
  valid: boolean;
  reason?: string;
}

export interface Operation {
  name: string;
  validate: (state: WorldState) => OperationValidation;
  apply: (state: WorldState) => WorldState;
}

export interface WorldProtocol {
  reset: (initialState?: WorldState) => void;
  applyOperation: (operationName: string, params?: any) => WorldState;
  getEntityState: (entityName: string) => Entity | null;
  toAbstractSnapshot: () => any;
}
