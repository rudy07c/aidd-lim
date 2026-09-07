import {
  WorldProtocol,
  Operation,
  EntityState,
} from '../protocol_adapter';

export const rules = {
  reset: (state: EntityState): EntityState => ({
    zef: 'nim',
  }),

  advanceZef: (state: EntityState): EntityState => {
    if (state.zef === 'nim') {
      return { ...state, zef: 'pex' };
    }
    if (state.zef === 'pex') {
      return { ...state, zef: 'dor' };
    }
    return state;
  },

  fastTrackZef: (state: EntityState): EntityState => {
    if (state.zef === 'nim') {
      return { ...state, zef: 'dor' };
    }
    return state;
  },
};
