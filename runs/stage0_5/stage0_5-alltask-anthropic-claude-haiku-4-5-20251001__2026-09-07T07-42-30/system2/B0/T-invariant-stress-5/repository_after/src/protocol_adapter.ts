import { WorldProtocol, Operation, OperationResult, OperationContext, EntityState } from './types';
import { createEntityState, mergeEntityState, getEntityProperty } from './entity_state';
import { vokRules, VokEntity } from './vok/rules';

let globalState: Map<string, EntityState> = new Map();
let operationHistory: Operation[] = [];

export function reset(): void {
  globalState.clear();
  operationHistory = [];
  const initialVok = vokRules.createInitialState();
  const vokState = createEntityState('vok', initialVok);
  globalState.set('vok', vokState);
}

export function applyOperation(operation: Operation): OperationResult {
  try {
    const entity = globalState.get(operation.entityId);
    if (!entity) {
      return { success: false, error: 'Entity not found' };
    }

    const entityData = entity.properties;

    switch (operation.type) {
      case 'advance': {
        const vokEntity: VokEntity = {
          id: operation.entityId,
          state: getEntityProperty(entity, 'state'),
          energy: getEntityProperty(entity, 'energy')
        };
        if (!vokRules.validateAdvance(vokEntity)) {
          return { success: false, error: 'Cannot advance: invalid state or insufficient energy' };
        }
        const updated = vokRules.advance(vokEntity);
        const newState = createEntityState(operation.entityId, updated);
        globalState.set(operation.entityId, newState);
        operationHistory.push(operation);
        return { success: true, result: newState };
      }
      case 'advanceVokSkip': {
        const vokEntity: VokEntity = {
          id: operation.entityId,
          state: getEntityProperty(entity, 'state'),
          energy: getEntityProperty(entity, 'energy')
        };
        if (!vokRules.validateAdvanceSkip(vokEntity)) {
          return { success: false, error: 'Cannot advance skip: invalid state or insufficient energy' };
        }
        const updated = vokRules.advanceSkip(vokEntity);
        const newState = createEntityState(operation.entityId, updated);
        globalState.set(operation.entityId, newState);
        operationHistory.push(operation);
        return { success: true, result: newState };
      }
      default:
        return { success: false, error: 'Unknown operation type' };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function getEntityState(entityId: string): EntityState | undefined {
  return globalState.get(entityId);
}

export function toAbstractSnapshot(): object {
  const snapshot: Record<string, unknown> = {};
  for (const [id, state] of globalState.entries()) {
    snapshot[id] = {
      id,
      properties: state.properties,
      timestamp: state.timestamp
    };
  }
  return snapshot;
}

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot
};
