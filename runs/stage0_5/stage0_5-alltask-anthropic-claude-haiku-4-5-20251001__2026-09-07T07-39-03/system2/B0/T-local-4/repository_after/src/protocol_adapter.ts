import {
  WorldProtocol,
  Operation,
  Entity,
  AbstractSnapshot,
} from './types';
import {
  VokState,
  VokOperation,
  initialState,
  applyVokOperation,
} from './vok/rules';

interface WorldState {
  vok: VokState;
}

let currentState: WorldState = {
  vok: initialState,
};

const reset = (): void => {
  currentState = {
    vok: initialState,
  };
};

const applyOperation = (operation: Operation): void => {
  if (operation.type === 'advanceVok' || operation.type === 'recoverVok') {
    currentState.vok = applyVokOperation(currentState.vok, operation.type as VokOperation);
  }
};

const getEntityState = (entityId: string): Entity | null => {
  if (entityId === 'vok') {
    return {
      id: 'vok',
      state: currentState.vok.state,
    };
  }
  return null;
};

const toAbstractSnapshot = (): AbstractSnapshot => {
  return {
    entities: [
      {
        id: 'vok',
        state: currentState.vok.state,
      },
    ],
  };
};

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
