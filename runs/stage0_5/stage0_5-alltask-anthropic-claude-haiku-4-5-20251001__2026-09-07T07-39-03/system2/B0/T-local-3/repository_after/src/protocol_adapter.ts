import { WorldProtocol, EntityState } from './vok/protocol.js';
import { rules } from './vok/rules.js';

interface AbstractSnapshot {
  fen: string;
  entities: Map<string, EntityState>;
}

const state = {
  fen: 'nim',
  entities: new Map<string, EntityState>(),
};

export const protocol: WorldProtocol = {
  reset(): void {
    state.fen = 'nim';
    state.entities.clear();
  },

  applyOperation(operationName: string, params?: Record<string, unknown>): void {
    if (operationName === 'resetFen') {
      state.fen = 'nim';
      return;
    }

    const operation = rules.operations[operationName];
    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }

    operation.execute(state, params);
  },

  getEntityState(entityId: string): EntityState | undefined {
    return state.entities.get(entityId);
  },

  toAbstractSnapshot(): AbstractSnapshot {
    return {
      fen: state.fen,
      entities: new Map(state.entities),
    };
  },
};
