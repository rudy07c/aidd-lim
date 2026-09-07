import { WorldProtocol, Operation, State } from '../types';

// Core state machine rules
export const rules = {
  initialState: {
    zef: 'nim',
    fen: 'nim'
  } as State,

  // Define valid transitions for each entity
  transitions: {
    zef: {
      nim: ['pex'],
      pex: ['dor']
    },
    fen: {
      nim: ['pex'],
      pex: ['dor']
    }
  },

  // Define valid operations
  operations: {
    moveZef: {
      apply: (state: State): State => {
        if (state.zef === 'nim') {
          return { ...state, zef: 'pex' };
        }
        if (state.zef === 'pex') {
          return { ...state, zef: 'dor' };
        }
        return state;
      },
      canApply: (state: State): boolean => state.zef !== 'dor'
    },
    moveFen: {
      apply: (state: State): State => {
        if (state.fen === 'nim') {
          return { ...state, fen: 'pex' };
        }
        if (state.fen === 'pex') {
          return { ...state, fen: 'dor' };
        }
        return state;
      },
      canApply: (state: State): boolean => state.fen !== 'dor'
    },
    rushZefFen: {
      apply: (state: State): State => {
        if (state.zef === 'nim' && state.fen === 'nim') {
          return { zef: 'dor', fen: 'dor' };
        }
        return state;
      },
      canApply: (state: State): boolean => state.zef === 'nim' && state.fen === 'nim'
    }
  }
};
