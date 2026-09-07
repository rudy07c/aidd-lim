import { rules, type Operation, type GameState } from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: Operation) => void;
  getEntityState: (entityId: string) => unknown;
  toAbstractSnapshot: () => unknown;
}

let currentState: GameState = rules.reset();

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = rules.reset();
  },

  applyOperation(operation: Operation): void {
    currentState = rules.applyOperation(currentState, operation);
  },

  getEntityState(entityId: string): unknown {
    if (entityId === 'osk') {
      return currentState.osk;
    }
    if (entityId === 'fen') {
      return currentState.fen;
    }
    return null;
  },

  toAbstractSnapshot(): unknown {
    return {
      state: currentState,
      timestamp: Date.now()
    };
  }
};
