import { WorldProtocol, EntityState, AbstractSnapshot } from './types';
import { rules } from './vok/rules';

let currentState: EntityState = {
  zef: 'pex',
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      zef: 'pex',
    };
  },

  applyOperation: (operationName: string): EntityState | null => {
    const operation = rules[operationName];
    if (!operation) {
      return null;
    }

    if (!operation.preconditions(currentState)) {
      return null;
    }

    currentState = operation.effects(currentState);
    return currentState;
  },

  getEntityState: (): EntityState => {
    return { ...currentState };
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      zef: currentState.zef,
    };
  },
};
