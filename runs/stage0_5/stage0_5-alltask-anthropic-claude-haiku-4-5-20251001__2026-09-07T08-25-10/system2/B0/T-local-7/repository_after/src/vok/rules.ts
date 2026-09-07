import { WorldProtocol } from '../types';

export interface VokState {
  status: 'nim' | 'dor';
}

export interface VokRules {
  canTransition(from: VokState, to: VokState): boolean;
  applyTransition(state: VokState, to: VokState): VokState;
}

const createVokRules = (): VokRules => {
  return {
    canTransition(from: VokState, to: VokState): boolean {
      // nim -> dor: normal transition
      if (from.status === 'nim' && to.status === 'dor') {
        return true;
      }
      // dor -> nim: normal transition
      if (from.status === 'dor' && to.status === 'nim') {
        return true;
      }
      return false;
    },
    applyTransition(state: VokState, to: VokState): VokState {
      if (this.canTransition(state, to)) {
        return { status: to.status };
      }
      return state;
    },
  };
};

export const vokRules = createVokRules();

export const vokOperations = {
  fullResetVok: {
    name: 'fullResetVok',
    description: 'Reset Vok from dor state to nim state completely',
    validate: (state: VokState): boolean => {
      return state.status === 'dor';
    },
    execute: (state: VokState): VokState => {
      if (state.status === 'dor') {
        return { status: 'nim' };
      }
      return state;
    },
  },
};
