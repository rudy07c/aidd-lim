import { EntityState, Operation } from '../types';

export const rules = {
  getInitialState: (): EntityState => ({
    Zef: 'nim',
    Rin: 'pex',
  }),

  applyOperation: (state: EntityState, operation: Operation): EntityState => {
    if (operation.type === 'setZefPex') {
      return {
        ...state,
        Zef: 'pex',
      };
    }

    if (operation.type === 'resetZef') {
      return {
        ...state,
        Zef: 'nim',
      };
    }

    if (operation.type === 'setRinPex') {
      return {
        ...state,
        Rin: 'pex',
      };
    }

    return state;
  },
};
