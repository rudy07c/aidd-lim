import type { Entity, Operation, WorldProtocol, AbstractSnapshot } from './types';
import { rules } from './vok/rules';

interface WorldState {
  entities: Map<string, Entity>;
}

const worldState: WorldState = {
  entities: new Map(),
};

export const protocol: WorldProtocol = {
  reset: () => {
    worldState.entities.clear();
  },

  applyOperation: (entityId: string, operationName: string): boolean => {
    const entity = worldState.entities.get(entityId);
    if (!entity) {
      return false;
    }

    const operation = rules[operationName];
    if (!operation) {
      return false;
    }

    operation.action(entity);
    return true;
  },

  getEntityState: (entityId: string): string | null => {
    const entity = worldState.entities.get(entityId);
    return entity ? entity.state : null;
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    const snapshot: AbstractSnapshot = {};
    for (const [id, entity] of worldState.entities) {
      snapshot[id] = entity.state;
    }
    return snapshot;
  },
};
