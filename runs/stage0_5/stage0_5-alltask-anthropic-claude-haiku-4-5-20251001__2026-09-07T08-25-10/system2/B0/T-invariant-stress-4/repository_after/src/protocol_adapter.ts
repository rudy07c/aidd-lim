import type { WorldProtocol, Operation, AbstractSnapshot } from './types';
import {
  advanceVokPexToDor,
  advanceZefPexToDor,
  turboVokZef,
  type VokState,
  type ZefState,
  type TurboVokZefOperation,
} from './vok/rules';

interface WorldState {
  entities: {
    [key: string]: VokState | ZefState;
  };
  history: Operation[];
}

let worldState: WorldState = {
  entities: {},
  history: [],
};

/**
 * Reset the world state to initial conditions
 */
function reset(): void {
  worldState = {
    entities: {
      Vok: {
        id: 'vok-1',
        name: 'Vok',
        phase: 'pex',
      } as VokState,
      Zef: {
        id: 'zef-1',
        name: 'Zef',
        phase: 'pex',
      } as ZefState,
    },
    history: [],
  };
}

/**
 * Apply an operation to the world state
 */
function applyOperation(operation: Operation): boolean {
  try {
    if (operation.type === 'advanceVokPexToDor') {
      const vok = worldState.entities.Vok as VokState;
      const result = advanceVokPexToDor(vok);
      if (result.success) {
        worldState.entities.Vok = result.result;
        worldState.history.push(operation);
        return true;
      }
      return false;
    }

    if (operation.type === 'advanceZefPexToDor') {
      const zef = worldState.entities.Zef as ZefState;
      const result = advanceZefPexToDor(zef);
      if (result.success) {
        worldState.entities.Zef = result.result;
        worldState.history.push(operation);
        return true;
      }
      return false;
    }

    if (operation.type === 'turboVokZef') {
      const vok = worldState.entities.Vok as VokState;
      const zef = worldState.entities.Zef as ZefState;
      const result = turboVokZef(vok, zef);
      if (result.success) {
        worldState.entities.Vok = result.result.vok;
        worldState.entities.Zef = result.result.zef;
        worldState.history.push(operation);
        return true;
      }
      return false;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get the current state of a specific entity
 */
function getEntityState(
  entityId: string
): (VokState | ZefState | null) {
  return worldState.entities[entityId] || null;
}

/**
 * Convert the current world state to an abstract snapshot
 */
function toAbstractSnapshot(): AbstractSnapshot {
  return {
    timestamp: Date.now(),
    entities: Object.entries(worldState.entities).reduce(
      (acc, [key, entity]) => {
        acc[key] = {
          id: entity.id,
          name: entity.name,
          phase: entity.phase,
        };
        return acc;
      },
      {} as Record<string, { id: string; name: string; phase: string }>
    ),
    operationCount: worldState.history.length,
  };
}

/**
 * WorldProtocol - main protocol interface for world operations
 */
export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
