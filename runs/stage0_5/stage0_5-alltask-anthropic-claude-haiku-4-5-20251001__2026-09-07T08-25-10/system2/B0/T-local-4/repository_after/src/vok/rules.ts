import { Operation } from '../protocol';

export interface VokState {
  position: 'pex' | 'dor';
}

export const vokRules = {
  initialState: (): VokState => ({
    position: 'pex',
  }),

  transitions: {
    moveVokToDor: (state: VokState): VokState => ({
      ...state,
      position: 'dor',
    }),

    recoverVok: (state: VokState): VokState => {
      if (state.position !== 'dor') {
        throw new Error('recoverVok can only be applied when Vok is at dor');
      }
      return {
        ...state,
        position: 'pex',
      };
    },
  },
};
