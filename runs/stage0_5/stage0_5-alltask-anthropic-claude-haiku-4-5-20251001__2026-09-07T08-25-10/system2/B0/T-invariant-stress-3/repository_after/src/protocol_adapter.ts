import { WorldProtocol, State, Operation } from './types';
import { rules } from './vok/rules';

let currentState: State = rules.initialState;
const operationHistory: Operation[] = [];

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = rules.initialState;
    operationHistory.length = 0;
  },

  applyOperation: (op: Operation): State => {
    const operationRule = rules.operations[op.type as keyof typeof rules.operations];
    
    if (!operationRule) {
      throw new Error(`Unknown operation: ${op.type}`);
    }

    if (!operationRule.canApply(currentState)) {
      throw new Error(`Operation ${op.type} cannot be applied in current state`);
    }

    currentState = operationRule.apply(currentState);
    operationHistory.push(op);
    return currentState;
  },

  getEntityState: (entity: 'zef' | 'fen'): string => {
    return currentState[entity];
  },

  toAbstractSnapshot: (): State => {
    return { ...currentState };
  }
};
