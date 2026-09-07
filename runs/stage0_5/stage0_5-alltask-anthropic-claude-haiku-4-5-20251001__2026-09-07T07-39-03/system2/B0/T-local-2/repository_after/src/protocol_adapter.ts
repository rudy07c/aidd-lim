import { WorldProtocol } from './types';
import { vokRules } from './vok/rules';

interface WorldState {
  vok?: {
    state: string;
    [key: string]: any;
  };
  [key: string]: any;
}

let currentState: WorldState = {
  vok: {
    state: 'nim'
  }
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      vok: {
        state: 'nim'
      }
    };
  },

  applyOperation: (operation: string, params?: any) => {
    if (operation === 'resetVok') {
      currentState = vokRules.resetVok(currentState);
      return true;
    }
    return false;
  },

  getEntityState: (entityId: string) => {
    if (entityId === 'vok') {
      return currentState.vok;
    }
    return null;
  },

  toAbstractSnapshot: () => {
    return {
      version: 1,
      state: currentState
    };
  }
};
