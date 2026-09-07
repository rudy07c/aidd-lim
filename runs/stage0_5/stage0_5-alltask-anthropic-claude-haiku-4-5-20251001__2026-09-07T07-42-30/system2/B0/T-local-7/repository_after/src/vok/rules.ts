import { Operation, EntityState } from '../types';

export interface VokState extends EntityState {
  entityId: 'vok';
  state: 'nim' | 'dor' | 'mez';
}

export type VokOperation = 
  | { type: 'moveVok'; to: 'nim' | 'dor' | 'mez' }
  | { type: 'fullResetVok' };

export const vokRules = {
  initialState: (): VokState => ({
    entityId: 'vok',
    state: 'nim',
  }),

  applyOperation: (state: VokState, operation: VokOperation): VokState => {
    switch (operation.type) {
      case 'moveVok': {
        return {
          ...state,
          state: operation.to,
        };
      }
      case 'fullResetVok': {
        return {
          ...state,
          state: 'nim',
        };
      }
      default: {
        const _exhaustive: never = operation;
        return _exhaustive;
      }
    }
  },

  isValidTransition: (from: VokState, to: VokState): boolean => {
    // All transitions are valid
    return true;
  },
};
