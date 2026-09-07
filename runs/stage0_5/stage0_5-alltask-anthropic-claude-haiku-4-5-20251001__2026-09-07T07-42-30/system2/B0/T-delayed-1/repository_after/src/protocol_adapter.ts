import { WorldProtocol, EntityState, Operation, AbstractSnapshot } from './vok/types';
import { rules } from './vok/rules';

let currentState: EntityState = {
  zef: {
    mode: 'nim'
  }
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      zef: {
        mode: 'nim'
      }
    };
  },

  applyOperation: (operation: Operation) => {
    currentState = rules(currentState, operation);
    return currentState;
  },

  getEntityState: () => {
    return currentState;
  },

  toAbstractSnapshot: () => {
    return {
      zef: currentState.zef.mode
    };
  }
};
