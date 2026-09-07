import { VokEntity } from './vok/types';
import { VokActions, VokStates, isValidTransition, getNextState } from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (entityId: string, operationName: string) => boolean;
  getEntityState: (entityId: string) => string | null;
  toAbstractSnapshot: () => Record<string, unknown>;
}

const entities: Map<string, VokEntity> = new Map();

export const protocol: WorldProtocol = {
  reset: (): void => {
    entities.clear();
  },

  applyOperation: (entityId: string, operationName: string): boolean => {
    if (!entities.has(entityId)) {
      if (operationName === 'create') {
        entities.set(entityId, {
          id: entityId,
          state: 'egg',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        return true;
      }
      return false;
    }

    const entity = entities.get(entityId)!;

    // Validate transition
    if (!isValidTransition(entity.state, operationName)) {
      return false;
    }

    // Get next state
    const nextState = getNextState(entity.state, operationName);
    if (!nextState) {
      return false;
    }

    // Apply state transition
    entity.state = nextState;
    entity.updatedAt = Date.now();
    return true;
  },

  getEntityState: (entityId: string): string | null => {
    const entity = entities.get(entityId);
    return entity ? entity.state : null;
  },

  toAbstractSnapshot: (): Record<string, unknown> => {
    const snapshot: Record<string, unknown> = {
      entities: Array.from(entities.values()).map((entity) => ({
        id: entity.id,
        state: entity.state,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      })),
      states: VokStates,
      actions: VokActions,
    };
    return snapshot;
  },
};
