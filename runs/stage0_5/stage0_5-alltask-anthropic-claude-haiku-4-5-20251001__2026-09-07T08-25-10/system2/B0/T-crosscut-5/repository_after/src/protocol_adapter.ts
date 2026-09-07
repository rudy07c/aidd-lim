import { WorldProtocol, EntityState, Operation, AbstractSnapshot } from './types';
import { rules } from './vok/rules';

let currentState: EntityState = rules.reset();

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = rules.reset();
  },

  applyOperation: (op: Operation) => {
    if (rules.isValidOperation(currentState, op)) {
      currentState = rules.applyOperation(currentState, op);
      return true;
    }
    return false;
  },

  getEntityState: () => {
    return { ...currentState };
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      tal: currentState.tal,
      fen: currentState.fen,
    };
  },
};
