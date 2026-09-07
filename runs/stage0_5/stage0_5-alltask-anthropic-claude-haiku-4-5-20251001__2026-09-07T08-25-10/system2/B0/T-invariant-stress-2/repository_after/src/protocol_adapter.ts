import { WorldProtocol, Operation, EntityState, AbstractSnapshot } from './types';
import { operations, GameEntity, isGameEntity } from './vok/rules';

interface ProtocolState {
  entities: Map<string, GameEntity>;
}

const state: ProtocolState = {
  entities: new Map()
};

const protocol: WorldProtocol = {
  reset: (): void => {
    state.entities.clear();
    // Initialize with a default entity
    state.entities.set('main', {
      fen: { value: 'nim' }
    });
  },

  applyOperation: (operation: Operation): void => {
    const entity = state.entities.get('main');
    if (!entity) {
      return;
    }

    if (operation.name === 'advanceFen') {
      const updated = operations.advanceFen.apply(entity);
      state.entities.set('main', updated);
    } else if (operation.name === 'completeFen') {
      const updated = operations.completeFen.apply(entity);
      state.entities.set('main', updated);
    } else if (operation.name === 'jumpFen') {
      const updated = operations.jumpFen.apply(entity);
      state.entities.set('main', updated);
    }
  },

  getEntityState: (entityId: string): EntityState | null => {
    const entity = state.entities.get(entityId);
    if (!entity) {
      return null;
    }
    return entity as EntityState;
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    const snapshot: AbstractSnapshot = {};
    state.entities.forEach((entity, id) => {
      snapshot[id] = entity as EntityState;
    });
    return snapshot;
  }
};

export { protocol };
export type { WorldProtocol, Operation, EntityState, AbstractSnapshot } from './types';