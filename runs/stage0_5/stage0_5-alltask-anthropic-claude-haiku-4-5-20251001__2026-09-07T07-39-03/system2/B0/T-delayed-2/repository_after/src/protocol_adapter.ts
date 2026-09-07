import type { WorldProtocol, WorldState, AbstractSnapshot } from './types';
import { OPERATIONS } from './vok/rules';

let currentState: WorldState = {
  entities: {
    Tal: { status: 'nim' },
    Osk: { status: 'nim' },
  },
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      entities: {
        Tal: { status: 'nim' },
        Osk: { status: 'nim' },
      },
    };
  },
  applyOperation: (operationName: string) => {
    const operation = OPERATIONS[operationName];
    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }
    currentState = operation.apply(currentState);
  },
  getEntityState: (entityName: string) => {
    const entity = currentState.entities[entityName as keyof typeof currentState.entities];
    if (!entity) {
      throw new Error(`Unknown entity: ${entityName}`);
    }
    return entity;
  },
  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      entities: currentState.entities,
    };
  },
};
