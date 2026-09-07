import { WorldProtocol, Operation, EntityState } from '../types';

export const rules: Record<string, Operation> = {
  advanceZef: {
    name: 'advanceZef',
    description: 'Advance Zef from pex to dor',
    preconditions: (state: EntityState) => state.zef === 'pex',
    effects: (state: EntityState) => ({
      ...state,
      zef: 'dor',
    }),
  },
  recoverZef: {
    name: 'recoverZef',
    description: 'Recover Zef from dor back to pex',
    preconditions: (state: EntityState) => state.zef === 'dor',
    effects: (state: EntityState) => ({
      ...state,
      zef: 'pex',
    }),
  },
};
