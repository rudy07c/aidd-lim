import type { Operation } from '../types';

export const rules = {
  initialState: {
    zef: 'nim',
    fen: 'nim',
  },

  operations: {
    advanceZef: {
      validate: (state: any) => state.zef === 'nim',
      apply: (state: any) => ({
        ...state,
        zef: 'pex',
      }),
    },
    advanceFen: {
      validate: (state: any) => state.fen === 'nim',
      apply: (state: any) => ({
        ...state,
        fen: 'pex',
      }),
    },
    finalizeZef: {
      validate: (state: any) => state.zef === 'pex',
      apply: (state: any) => ({
        ...state,
        zef: 'dor',
      }),
    },
    finalizeFen: {
      validate: (state: any) => state.fen === 'pex',
      apply: (state: any) => ({
        ...state,
        fen: 'dor',
      }),
    },
    rushZefFen: {
      validate: (state: any) => state.zef === 'nim' && state.fen === 'nim',
      apply: (state: any) => ({
        ...state,
        zef: 'dor',
        fen: 'dor',
      }),
    },
  } as Record<string, { validate: (state: any) => boolean; apply: (state: any) => any }>,
};
