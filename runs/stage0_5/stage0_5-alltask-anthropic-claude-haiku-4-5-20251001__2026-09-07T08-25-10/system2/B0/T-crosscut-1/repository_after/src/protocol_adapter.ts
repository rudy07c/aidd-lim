import { WorldState } from './vok/types';
import { Operation, OperationResult, applyRules } from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: Operation) => boolean;
  getEntityState: (entity: 'zef' | 'tal') => string;
  toAbstractSnapshot: () => WorldState;
}

let currentState: WorldState = {
  zef: 'void',
  tal: 'void',
};

export const protocol: WorldProtocol = {
  reset: (): void => {
    const result = applyRules(currentState, { type: 'reset' });
    if (result.success && result.newState) {
      currentState = result.newState;
    }
  },

  applyOperation: (operation: Operation): boolean => {
    const result = applyRules(currentState, operation);
    if (result.success && result.newState) {
      currentState = result.newState;
      return true;
    }
    return false;
  },

  getEntityState: (entity: 'zef' | 'tal'): string => {
    return currentState[entity];
  },

  toAbstractSnapshot: (): WorldState => {
    return { ...currentState };
  },
};
