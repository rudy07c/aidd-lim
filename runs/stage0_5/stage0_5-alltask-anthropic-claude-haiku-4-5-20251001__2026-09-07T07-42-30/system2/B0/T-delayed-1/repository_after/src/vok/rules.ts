import { WorldProtocol } from './types';

export const rules: WorldProtocol['applyOperation'] = (state, operation) => {
  switch (operation.type) {
    case 'resetZef':
      return {
        ...state,
        zef: {
          ...state.zef,
          mode: 'nim'
        }
      };
    default:
      return state;
  }
};
