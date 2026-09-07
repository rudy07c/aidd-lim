import { WorldProtocol, Operation, EntityState } from '../types';

export interface VokState extends EntityState {
  state: 'nim' | 'dor' | 'par';
}

export const vokRules: WorldProtocol<VokState> = {
  reset: (): VokState => ({
    id: 'vok',
    state: 'nim',
  }),

  applyOperation: (state: VokState, operation: Operation): VokState => {
    if (operation.type === 'advanceVok') {
      if (state.state === 'nim') {
        return { ...state, state: 'dor' };
      }
      if (state.state === 'dor') {
        return { ...state, state: 'par' };
      }
      return state;
    }

    if (operation.type === 'forceAdvanceVok') {
      // Force advance from nim directly to dor in a single operation
      if (state.state === 'nim') {
        return { ...state, state: 'dor' };
      }
      return state;
    }

    return state;
  },

  getEntityState: (state: VokState): VokState => state,

  toAbstractSnapshot: (state: VokState) => ({
    id: state.id,
    state: state.state,
  }),
};
