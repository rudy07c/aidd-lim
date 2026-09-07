import { WorldProtocol } from '../types';

export const vokRules = {
  resetVok: (state: any) => {
    // Transition Vok from 'pex' state back to 'nim' state
    if (state.vok && state.vok.state === 'pex') {
      return {
        ...state,
        vok: {
          ...state.vok,
          state: 'nim'
        }
      };
    }
    return state;
  }
};
