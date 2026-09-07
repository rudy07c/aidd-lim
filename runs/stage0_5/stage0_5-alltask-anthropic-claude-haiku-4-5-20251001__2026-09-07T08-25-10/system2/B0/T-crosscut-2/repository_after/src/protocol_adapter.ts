import {
  VOK_STATES,
  ZEF_STATES,
  isValidVokTransition,
  isValidZefTransition,
  type VokState,
  type ZefState
} from './vok/rules';

export interface Entity {
  vok: VokState;
  zef: ZefState;
}

export type OperationType = 'advanceVok' | 'advanceZef' | 'jumpVokZef';

export interface Operation {
  type: OperationType;
  entityId: string;
}

interface WorldState {
  entities: Map<string, Entity>;
}

let worldState: WorldState = {
  entities: new Map()
};

export const protocol = {
  reset(): void {
    worldState = {
      entities: new Map()
    };
  },

  applyOperation(operation: Operation): void {
    const entity = worldState.entities.get(operation.entityId);
    if (!entity) {
      throw new Error(`Entity ${operation.entityId} not found`);
    }

    switch (operation.type) {
      case 'advanceVok': {
        const nextState = entity.vok === 'nim' ? 'pex' : entity.vok === 'pex' ? 'dor' : null;
        if (nextState && isValidVokTransition(entity.vok, nextState as VokState)) {
          entity.vok = nextState as VokState;
        } else {
          throw new Error(`Invalid Vok transition from ${entity.vok}`);
        }
        break;
      }
      case 'advanceZef': {
        const nextState = entity.zef === 'nim' ? 'pex' : entity.zef === 'pex' ? 'dor' : null;
        if (nextState && isValidZefTransition(entity.zef, nextState as ZefState)) {
          entity.zef = nextState as ZefState;
        } else {
          throw new Error(`Invalid Zef transition from ${entity.zef}`);
        }
        break;
      }
      case 'jumpVokZef': {
        if (entity.vok !== 'nim' || entity.zef !== 'nim') {
          throw new Error(`jumpVokZef requires both Vok and Zef to be in 'nim' state`);
        }
        if (isValidVokTransition(entity.vok, 'dor') && isValidZefTransition(entity.zef, 'dor')) {
          entity.vok = 'dor';
          entity.zef = 'dor';
        } else {
          throw new Error(`Invalid transition: jumpVokZef cannot be applied`);
        }
        break;
      }
      default:
        throw new Error(`Unknown operation type: ${(operation as any).type}`);
    }
  },

  getEntityState(entityId: string): Entity | null {
    return worldState.entities.get(entityId) || null;
  },

  toAbstractSnapshot() {
    const snapshot: Record<string, Entity> = {};
    for (const [id, entity] of worldState.entities) {
      snapshot[id] = { ...entity };
    }
    return snapshot;
  }
};

// Helper function to create entities for testing
export function createEntity(entityId: string, initialVok: VokState = 'nim', initialZef: ZefState = 'nim'): void {
  if (worldState.entities.has(entityId)) {
    throw new Error(`Entity ${entityId} already exists`);
  }
  worldState.entities.set(entityId, {
    vok: initialVok,
    zef: initialZef
  });
}