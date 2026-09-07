import { WorldProtocol, Operation, WorldState, Entity } from './types';
import { rules } from './vok/rules';

let currentState: WorldState = { entities: [] };

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = { entities: [] };
  },

  applyOperation: (op: Operation): boolean => {
    if (!rules.validateOperation(op, currentState)) {
      return false;
    }
    currentState = rules.applyOperation(op, currentState);
    return true;
  },

  getEntityState: (entityId: string): Entity | undefined => {
    return currentState.entities.find(e => e.id === entityId);
  },

  toAbstractSnapshot: () => {
    return {
      entities: currentState.entities.map(e => ({
        id: e.id,
        location: e.location,
      })),
    };
  },
};
