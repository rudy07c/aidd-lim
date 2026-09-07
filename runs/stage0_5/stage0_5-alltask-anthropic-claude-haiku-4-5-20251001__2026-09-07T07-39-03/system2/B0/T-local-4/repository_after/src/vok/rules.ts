import { WorldProtocol } from '../types';

interface VokState {
  state: 'init' | 'pex' | 'dor';
}

const initialState: VokState = {
  state: 'init',
};

type VokOperation = 'advanceVok' | 'recoverVok';

const applyVokOperation = (
  state: VokState,
  operation: VokOperation
): VokState => {
  switch (operation) {
    case 'advanceVok':
      if (state.state === 'init') {
        return { state: 'pex' };
      } else if (state.state === 'pex') {
        return { state: 'dor' };
      }
      return state;
    case 'recoverVok':
      if (state.state === 'dor') {
        return { state: 'pex' };
      }
      return state;
    default:
      return state;
  }
};

export { VokState, VokOperation, initialState, applyVokOperation };
