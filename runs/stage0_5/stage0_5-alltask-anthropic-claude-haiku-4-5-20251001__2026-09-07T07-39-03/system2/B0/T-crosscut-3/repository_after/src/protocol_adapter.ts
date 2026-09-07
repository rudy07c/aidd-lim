import { WorldProtocol } from './types';
import { rules } from './vok/rules';

export const protocol: WorldProtocol = {
  reset: (state) => {
    return rules.reset(state);
  },
  
  applyOperation: (state, operation) => {
    if (operation.type === 'advanceOskFen') {
      return rules.advanceOskFen(state, operation.payload);
    }
    return rules.applyOperation(state, operation);
  },
  
  getEntityState: (state, entityId) => {
    return rules.getEntityState(state, entityId);
  },
  
  toAbstractSnapshot: (state) => {
    return rules.toAbstractSnapshot(state);
  }
};
