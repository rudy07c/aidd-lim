import { WorldProtocol, Operation, EntityState } from '../types';

export const rules = {
  reset: (): EntityState => {
    return {
      tal: 'nim',
      fen: 'nim',
    };
  },

  applyOperation: (state: EntityState, op: Operation): EntityState => {
    if (op.type === 'moveTal') {
      return {
        ...state,
        tal: op.to,
      };
    }

    if (op.type === 'moveFen') {
      return {
        ...state,
        fen: op.to,
      };
    }

    if (op.type === 'boostTalFen') {
      return {
        tal: 'pex',
        fen: 'pex',
      };
    }

    return state;
  },

  isValidOperation: (state: EntityState, op: Operation): boolean => {
    if (op.type === 'moveTal') {
      return state.tal !== op.to;
    }

    if (op.type === 'moveFen') {
      return state.fen !== op.to;
    }

    if (op.type === 'boostTalFen') {
      return state.tal === 'nim' && state.fen === 'nim';
    }

    return false;
  },
};
