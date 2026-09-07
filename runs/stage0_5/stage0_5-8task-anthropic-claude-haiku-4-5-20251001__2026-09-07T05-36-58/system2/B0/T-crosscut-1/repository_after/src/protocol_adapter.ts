import { applyOperation as rulesApplyOperation } from './vok/rules';
import { WorldState, Operation } from './vok/types';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: Operation) => void;
  getEntityState: (entity: string) => string | null;
  toAbstractSnapshot: () => WorldState;
}

let currentState: WorldState = {
  entities: {
    zef: { name: 'zef', state: 'kok' },
    tal: { name: 'tal', state: 'kok' },
  },
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = rulesApplyOperation(currentState, { type: 'reset' });
  },

  applyOperation: (operation: Operation) => {
    currentState = rulesApplyOperation(currentState, operation);
  },

  getEntityState: (entity: string) => {
    return currentState.entities[entity]?.state || null;
  },

  toAbstractSnapshot: () => {
    return JSON.parse(JSON.stringify(currentState));
  },
};
