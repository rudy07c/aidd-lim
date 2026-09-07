import { WorldProtocol } from '../protocol_adapter';

export interface VokState {
  state: 'pex' | 'dor' | 'voy';
  energy: number;
}

export const createVokRules = () => {
  return {
    advanceVok: (vokState: VokState): VokState => {
      if (vokState.state === 'pex') {
        return { ...vokState, state: 'dor', energy: vokState.energy - 1 };
      }
      if (vokState.state === 'dor') {
        return { ...vokState, state: 'voy', energy: vokState.energy - 1 };
      }
      return vokState;
    },
    advanceVokSkip: (vokState: VokState): VokState => {
      if (vokState.state === 'pex') {
        return { ...vokState, state: 'dor', energy: vokState.energy };
      }
      return vokState;
    },
  };
};
