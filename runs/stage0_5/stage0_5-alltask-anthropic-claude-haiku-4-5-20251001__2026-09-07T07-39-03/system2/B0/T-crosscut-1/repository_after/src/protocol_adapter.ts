import { WorldProtocol, Operation, EntityState, AbstractSnapshot } from './types';
import { rules } from './vok/rules';

interface WorldState {
  [key: string]: string;
}

let currentState: WorldState = {};

const initializeState = (): void => {
  currentState = {};
  rules.entities.forEach(entity => {
    currentState[entity] = rules.initialState;
  });
};

const applyOperationInternal = (operation: Operation): boolean => {
  const operationRule = rules.operations[operation.type as keyof typeof rules.operations];
  
  if (!operationRule) {
    return false;
  }

  // For kindleBoth, advance both Zef and Tal
  if (operation.type === 'kindleBoth') {
    currentState['Zef'] = operationRule.target;
    currentState['Tal'] = operationRule.target;
    return true;
  }

  // For individual operations
  if (operationRule.actors && operationRule.actors.length > 0) {
    const actor = operationRule.actors[0];
    if (currentState.hasOwnProperty(actor)) {
      currentState[actor] = operationRule.target;
      return true;
    }
  }

  return false;
};

export const protocol: WorldProtocol = {
  reset: (): void => {
    initializeState();
  },

  applyOperation: (operation: Operation): boolean => {
    return applyOperationInternal(operation);
  },

  getEntityState: (entityName: string): EntityState => {
    return currentState[entityName] || rules.initialState;
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      timestamp: new Date().toISOString(),
      state: { ...currentState }
    };
  }
};

initializeState();
