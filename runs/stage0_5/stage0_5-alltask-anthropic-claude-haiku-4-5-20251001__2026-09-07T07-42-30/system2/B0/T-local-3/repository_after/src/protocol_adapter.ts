import { GameState, WorldProtocol, Operation, AbstractSnapshot } from './types';
import { vokRules } from './vok/rules';

let currentState: GameState = {
  fen: 'nim'
};

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = {
      fen: 'nim'
    };
  },

  applyOperation(operation: Operation): void {
    if (operation.type === 'resetFen') {
      const result = vokRules.resetFen();
      currentState = { ...currentState, ...result };
    } else if (operation.type === 'fenOperation') {
      const result = vokRules.applyFenOperation(currentState, operation.name, operation.data);
      currentState = { ...currentState, ...result };
    }
  },

  getEntityState(): GameState {
    return { ...currentState };
  },

  toAbstractSnapshot(): AbstractSnapshot {
    return {
      fen: currentState.fen
    };
  }
};
