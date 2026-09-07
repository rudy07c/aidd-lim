import { GameState, INITIAL_STATE, Operation, applyGameOperation } from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: Operation) => void;
  getEntityState: (entityId: string) => any;
  toAbstractSnapshot: () => any;
}

let currentState: GameState = { ...INITIAL_STATE };

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = { ...INITIAL_STATE };
  },

  applyOperation: (operation: Operation) => {
    currentState = applyGameOperation(currentState, operation);
  },

  getEntityState: (entityId: string) => {
    if (entityId === 'fen') {
      return { fen: currentState.fen };
    }
    return null;
  },

  toAbstractSnapshot: () => {
    return {
      entities: {
        fen: { fen: currentState.fen }
      },
      state: currentState
    };
  }
};
