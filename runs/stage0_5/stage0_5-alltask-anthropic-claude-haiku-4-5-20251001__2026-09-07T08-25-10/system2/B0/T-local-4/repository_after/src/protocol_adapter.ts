import { WorldProtocol, Operation } from './protocol';
import { vokRules, VokState } from './vok/rules';

interface WorldState {
  vok: VokState;
}

const initialWorldState: WorldState = {
  vok: vokRules.initialState(),
};

let currentState: WorldState = { ...initialWorldState };

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = { ...initialWorldState };
  },

  applyOperation: (op: Operation) => {
    switch (op.type) {
      case 'moveVokToDor':
        currentState.vok = vokRules.transitions.moveVokToDor(currentState.vok);
        break;
      case 'recoverVok':
        currentState.vok = vokRules.transitions.recoverVok(currentState.vok);
        break;
      default:
        throw new Error(`Unknown operation type: ${(op as any).type}`);
    }
  },

  getEntityState: (entityId: string) => {
    if (entityId === 'vok') {
      return currentState.vok;
    }
    throw new Error(`Unknown entity: ${entityId}`);
  },

  toAbstractSnapshot: () => ({
    vok: currentState.vok,
  }),
};
