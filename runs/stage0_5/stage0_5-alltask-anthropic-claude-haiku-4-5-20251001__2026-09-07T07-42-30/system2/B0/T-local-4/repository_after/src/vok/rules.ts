import { Operation, EntityState } from '../types';

export interface VokState extends EntityState {
  stage: 'initial' | 'pex' | 'dor';
}

export const vokRules = {
  advanceVok: (state: VokState): VokState => {
    if (state.stage === 'initial') {
      return { ...state, stage: 'pex' };
    }
    if (state.stage === 'pex') {
      return { ...state, stage: 'dor' };
    }
    return state;
  },
  recoverVok: (state: VokState): VokState => {
    if (state.stage === 'dor') {
      return { ...state, stage: 'pex' };
    }
    return state;
  },
};
