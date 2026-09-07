import { WorldState, WorldProtocol, Operation } from './vok/types';
import { operationHandlers } from './vok/rules';

let currentState: WorldState = {
  positions: {
    Fen: 'pex',
    Zef: 'pex',
    Entities: 'dor',
  },
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      positions: {
        Fen: 'pex',
        Zef: 'pex',
        Entities: 'dor',
      },
    };
  },

  applyOperation: (operation: Operation) => {
    const handler = operationHandlers[operation.type];
    if (!handler) {
      throw new Error(`Unknown operation type: ${operation.type}`);
    }
    currentState = handler(currentState, operation.params);
  },

  getEntityState: (entityName: string) => {
    return currentState.positions[entityName] || null;
  },

  toAbstractSnapshot: () => {
    return {
      timestamp: new Date().toISOString(),
      state: { ...currentState },
    };
  },
};
