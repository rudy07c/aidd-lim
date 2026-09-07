import { Operation, EntityState, WorldProtocol, AbstractSnapshot } from './types';
import { VokState, vokRules } from './vok/rules';

interface WorldState {
  vok: VokState;
}

const initialState: WorldState = {
  vok: { id: 'vok', stage: 'initial' },
};

let currentState = { ...initialState };

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = { ...initialState };
  },

  applyOperation: (operation: Operation) => {
    if (operation.type === 'advanceVok') {
      currentState.vok = vokRules.advanceVok(currentState.vok);
    } else if (operation.type === 'recoverVok') {
      currentState.vok = vokRules.recoverVok(currentState.vok);
    }
  },

  getEntityState: (entityId: string): EntityState | null => {
    if (entityId === 'vok') {
      return currentState.vok;
    }
    return null;
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      entities: {
        vok: currentState.vok,
      },
    };
  },
};
