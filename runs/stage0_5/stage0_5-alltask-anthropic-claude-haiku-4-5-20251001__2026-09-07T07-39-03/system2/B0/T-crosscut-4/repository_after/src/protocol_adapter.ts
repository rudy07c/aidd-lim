import type { WorldProtocol, Entity, Operation, EntityState } from './types';
import { applyRule, validateState, isValidOperation } from './vok/rules';

interface WorldState {
  entities: Map<string, Entity>;
  operationHistory: Operation[];
}

let worldState: WorldState = {
  entities: new Map(),
  operationHistory: [],
};

export const protocol: WorldProtocol = {
  reset() {
    worldState = {
      entities: new Map(),
      operationHistory: [],
    };
  },

  applyOperation(operation: Operation): void {
    const { entityId, type } = operation;

    if (!isValidOperation(type)) {
      throw new Error(`Unknown operation type: ${type}`);
    }

    const entity = worldState.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const updatedEntity = applyRule(entity, type);

    if (!validateState(updatedEntity)) {
      throw new Error(`Invalid state after operation: ${type}`);
    }

    worldState.entities.set(entityId, updatedEntity);
    worldState.operationHistory.push(operation);
  },

  getEntityState(entityId: string): EntityState {
    const entity = worldState.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const state: EntityState = {};
    if (entity.Fen !== undefined) {
      state.Fen = entity.Fen;
    }
    if (entity.Zef !== undefined) {
      state.Zef = entity.Zef;
    }
    return state;
  },

  toAbstractSnapshot() {
    const snapshot: Record<string, EntityState> = {};

    for (const [entityId, entity] of worldState.entities.entries()) {
      const state: EntityState = {};
      if (entity.Fen !== undefined) {
        state.Fen = entity.Fen;
      }
      if (entity.Zef !== undefined) {
        state.Zef = entity.Zef;
      }
      snapshot[entityId] = state;
    }

    return {
      entities: snapshot,
      operationCount: worldState.operationHistory.length,
    };
  },
};

// Helper function to initialize entities (for testing/setup)
export function initializeEntity(entityId: string, entity: Entity): void {
  if (!validateState(entity)) {
    throw new Error(`Invalid initial state for entity: ${entityId}`);
  }
  worldState.entities.set(entityId, entity);
}
