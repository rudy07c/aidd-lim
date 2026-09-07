import { WorldState, Operation, INITIAL_STATE, applyRule, OperationType } from './vok/rules';

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): void;
  getEntityState(): WorldState;
  toAbstractSnapshot(): AbstractSnapshot;
}

export interface AbstractSnapshot {
  fenStage: 'pex' | 'dor' | null;
  timestamp: number;
}

let currentState: WorldState = { ...INITIAL_STATE };
const operationHistory: Operation[] = [];

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = { ...INITIAL_STATE };
    operationHistory.length = 0;
  },

  applyOperation(operation: Operation): void {
    const newState = applyRule(currentState, operation);
    if (newState !== currentState) {
      currentState = newState;
      operationHistory.push(operation);
    }
  },

  getEntityState(): WorldState {
    return { ...currentState };
  },

  toAbstractSnapshot(): AbstractSnapshot {
    return {
      fenStage: currentState.fenStage,
      timestamp: currentState.lastOperationTime,
    };
  },
};
