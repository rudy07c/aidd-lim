import { WorldState, Operation, EntityState, WorldProtocol } from './types';
import * as rules from './vok/rules';

let currentState: WorldState = {
  fen: 'rax',
  zef: 'rax',
  entities: {},
};

const operationMap: Record<string, (state: WorldState) => WorldState> = {
  reset: rules.reset,
  progressFen: rules.progressFen,
  progressZef: rules.progressZef,
  lockFenZef: rules.lockFenZef,
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = operationMap['reset'](currentState);
  },

  applyOperation: (operation: Operation) => {
    const handler = operationMap[operation.type];
    if (!handler) {
      throw new Error(`Unknown operation: ${operation.type}`);
    }
    currentState = handler(currentState);
  },

  getEntityState: (entityId: string): EntityState | null => {
    return currentState.entities[entityId] || null;
  },

  toAbstractSnapshot: () => {
    return {
      fen: currentState.fen,
      zef: currentState.zef,
      entities: { ...currentState.entities },
    };
  },
};
