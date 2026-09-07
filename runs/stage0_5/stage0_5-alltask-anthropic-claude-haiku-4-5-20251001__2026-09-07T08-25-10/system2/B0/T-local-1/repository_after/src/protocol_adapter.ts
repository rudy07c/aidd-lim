import { EntityState, Operation, OperationResult, AbstractSnapshot } from './types';
import { VokState, isVokState, applyVokOperation } from './vok/rules';

interface WorldState {
  entities: Record<string, EntityState>;
}

interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): OperationResult;
  getEntityState(entityName: string): EntityState | null;
  toAbstractSnapshot(): AbstractSnapshot;
}

let worldState: WorldState = {
  entities: {}
};

function initializeDefaultEntities(): void {
  worldState.entities['vok'] = {
    name: 'vok',
    state: 'initial'
  } as VokState;
}

export const protocol: WorldProtocol = {
  reset(): void {
    worldState = { entities: {} };
    initializeDefaultEntities();
  },

  applyOperation(operation: Operation): OperationResult {
    try {
      if (operation.targetEntity === 'vok') {
        const vokState = worldState.entities['vok'];
        if (isVokState(vokState)) {
          worldState.entities['vok'] = applyVokOperation(vokState, operation);
          return {
            success: true,
            message: `Operation ${operation.type} applied successfully`
          };
        }
      }
      return {
        success: false,
        message: `Unable to apply operation ${operation.type}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Error applying operation: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  getEntityState(entityName: string): EntityState | null {
    return worldState.entities[entityName] || null;
  },

  toAbstractSnapshot(): AbstractSnapshot {
    return {
      timestamp: Date.now(),
      entities: Object.values(worldState.entities).map(entity => ({
        name: entity.name,
        state: (entity as any).state
      }))
    };
  }
};

// Initialize on module load
initializeDefaultEntities();
