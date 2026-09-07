import { initVok, advanceVok, advanceVokSkip, isValidOperation } from './vok/rules';
import type { EntityState, Operation, WorldProtocol } from './types';

interface WorldState {
  entities: Record<string, EntityState>;
}

let currentState: WorldState = {
  entities: {
    vok: initVok(),
  },
};

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = {
      entities: {
        vok: initVok(),
      },
    };
  },

  applyOperation(operation: Operation): boolean {
    const entity = currentState.entities[operation.entityId];
    if (!entity) return false;

    if (!isValidOperation(operation, entity)) return false;

    if (operation.type === 'advanceVok') {
      currentState.entities[operation.entityId] = advanceVok(entity as any);
      return true;
    }

    if (operation.type === 'advanceVokSkip') {
      currentState.entities[operation.entityId] = advanceVokSkip(entity as any);
      return true;
    }

    return false;
  },

  getEntityState(entityId: string): EntityState | null {
    return currentState.entities[entityId] || null;
  },

  toAbstractSnapshot(): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [id, entity] of Object.entries(currentState.entities)) {
      snapshot[id] = {
        id: entity.id,
        type: entity.type,
        ...(entity.type === 'vok' && { stage: (entity as any).stage }),
      };
    }
    return snapshot;
  },
};
