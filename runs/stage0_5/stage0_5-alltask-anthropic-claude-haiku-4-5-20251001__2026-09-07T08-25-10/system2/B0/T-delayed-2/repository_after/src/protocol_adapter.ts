import type { WorldProtocol } from './types';
import { initialState, operations } from './vok/rules';
import type { WorldState } from './types';

export const protocol: WorldProtocol = {
  reset: () => initialState,

  applyOperation: (state: WorldState, operationName: string) => {
    const operation = operations[operationName];
    if (!operation) {
      throw new Error(`Operation '${operationName}' not found`);
    }
    if (!operation.validate(state)) {
      throw new Error(`Operation '${operationName}' validation failed`);
    }
    return operation.apply(state);
  },

  getEntityState: (state: WorldState, entityId: string) => {
    const entity = state.entities[entityId];
    if (!entity) {
      throw new Error(`Entity '${entityId}' not found`);
    }
    return entity;
  },

  toAbstractSnapshot: (state: WorldState) => {
    return {
      timestamp: new Date().toISOString(),
      entities: Object.values(state.entities).map((entity) => ({
        id: entity.id,
        name: entity.name,
        position: entity.position,
      })),
    };
  },
};
