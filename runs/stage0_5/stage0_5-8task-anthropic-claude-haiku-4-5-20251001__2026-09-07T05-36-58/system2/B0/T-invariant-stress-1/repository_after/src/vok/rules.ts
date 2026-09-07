import { WorldState, Operation } from '../types';

export const rules = {
  applyZefProgression: (state: WorldState, operation: Operation): WorldState => {
    if (operation.type === 'progressZef') {
      const zefState = state.zef;
      if (zefState === 'nim') {
        return {
          ...state,
          zef: 'pex',
        };
      } else if (zefState === 'pex') {
        return {
          ...state,
          zef: 'dor',
        };
      }
    } else if (operation.type === 'fastTrackZef') {
      const zefState = state.zef;
      if (zefState === 'nim') {
        return {
          ...state,
          zef: 'dor',
        };
      }
    }
    return state;
  },
};
