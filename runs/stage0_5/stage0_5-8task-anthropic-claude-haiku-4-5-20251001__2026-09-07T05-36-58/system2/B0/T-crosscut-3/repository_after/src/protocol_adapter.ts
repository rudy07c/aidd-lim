import { WorldState, Operation, applyOperationImpl, getInitialState, EntityId } from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: Operation) => void;
  getEntityState: (entityId: EntityId) => { status: string };
  toAbstractSnapshot: () => WorldState;
}

let currentState: WorldState = getInitialState();

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = getInitialState();
  },

  applyOperation: (operation: Operation) => {
    currentState = applyOperationImpl(currentState, operation);
  },

  getEntityState: (entityId: EntityId) => {
    return currentState[entityId];
  },

  toAbstractSnapshot: () => {
    return JSON.parse(JSON.stringify(currentState));
  },
};
