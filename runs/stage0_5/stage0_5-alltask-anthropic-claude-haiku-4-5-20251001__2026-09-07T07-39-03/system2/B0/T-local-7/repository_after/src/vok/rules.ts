import { Operation, WorldState } from '../types';

export const rules = {
  // Vok state transitions
  transitionVokToDor: {
    validate: (state: WorldState) => state.vok === 'nim',
    apply: (state: WorldState) => ({
      ...state,
      vok: 'dor',
    }),
  },
  transitionVokToNim: {
    validate: (state: WorldState) => state.vok === 'dor',
    apply: (state: WorldState) => ({
      ...state,
      vok: 'nim',
    }),
  },
  fullResetVok: {
    validate: (state: WorldState) => state.vok === 'dor',
    apply: (state: WorldState) => ({
      ...state,
      vok: 'nim',
    }),
  },
};
