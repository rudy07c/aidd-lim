import { Entity, Operation, WorldState, SPECIAL_OPERATIONS, moveEntity } from './vok/rules';

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): boolean;
  getEntityState(entityId: string): string | null;
  toAbstractSnapshot(): Record<string, string>;
}

// Internal state
let worldState: WorldState = {
  entities: new Map(),
};

// Initialize default entities
function initializeWorld(): void {
  worldState.entities.clear();
  worldState.entities.set('Zef', { id: 'Zef', state: 'nim' });
  worldState.entities.set('Fen', { id: 'Fen', state: 'nim' });
}

// Protocol implementation
export const protocol: WorldProtocol = {
  reset(): void {
    initializeWorld();
  },

  applyOperation(operation: Operation): boolean {
    // Check for special operations first
    if (operation.type === 'rushZefFen') {
      const specialHandler = SPECIAL_OPERATIONS['rushZefFen'];
      if (specialHandler) {
        return specialHandler(worldState, operation);
      }
      return false;
    }

    // Handle standard moveEntity operation
    if (operation.type === 'moveEntity') {
      const { targetId, targetState } = operation;
      if (!targetId || !targetState) {
        return false;
      }
      return moveEntity(worldState, targetId, targetState);
    }

    return false;
  },

  getEntityState(entityId: string): string | null {
    const entity = worldState.entities.get(entityId);
    return entity ? entity.state : null;
  },

  toAbstractSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};
    for (const [id, entity] of worldState.entities) {
      snapshot[id] = entity.state;
    }
    return snapshot;
  },
};

// Initialize on module load
initializeWorld();
