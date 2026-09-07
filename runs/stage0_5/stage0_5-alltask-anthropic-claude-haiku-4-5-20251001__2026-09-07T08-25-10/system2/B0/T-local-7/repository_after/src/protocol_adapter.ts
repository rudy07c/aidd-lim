import { WorldProtocol, Entity, Operation, AbstractSnapshot } from './types';
import { VokState, vokOperations } from './vok/rules';

interface EntityState {
  [key: string]: Entity;
}

const initialState: EntityState = {
  vok: {
    id: 'vok',
    type: 'vok',
    state: { status: 'nim' } as VokState,
  },
};

let currentState: EntityState = { ...initialState };

const reset = (): void => {
  currentState = { ...initialState };
};

const applyOperation = (operation: Operation): void => {
  if (operation.name === 'fullResetVok') {
    const entity = currentState[operation.entityId];
    if (entity && operation.entityId === 'vok') {
      const vokOp = vokOperations.fullResetVok;
      if (vokOp.validate(entity.state as VokState)) {
        entity.state = vokOp.execute(entity.state as VokState);
      }
    }
  }
};

const getEntityState = (entityId: string): Entity | undefined => {
  return currentState[entityId];
};

const toAbstractSnapshot = (): AbstractSnapshot => {
  return {
    timestamp: Date.now(),
    entities: Object.values(currentState),
  };
};

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
