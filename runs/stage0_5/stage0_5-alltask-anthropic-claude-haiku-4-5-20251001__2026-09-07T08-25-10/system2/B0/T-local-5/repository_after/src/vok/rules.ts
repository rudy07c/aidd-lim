import { EntityState } from '../entity';
import { Operation, OperationFactory } from '../operations';

export const rules = {
  moveZefToDor: (factory: OperationFactory): Operation => {
    return factory.create('moveZefToDor', (state: EntityState) => {
      if (state.zef?.location === 'pex') {
        return {
          ...state,
          zef: {
            ...state.zef,
            location: 'dor',
          },
        };
      }
      return state;
    });
  },
  
  recoverZef: (factory: OperationFactory): Operation => {
    return factory.create('recoverZef', (state: EntityState) => {
      if (state.zef?.location === 'dor') {
        return {
          ...state,
          zef: {
            ...state.zef,
            location: 'pex',
          },
        };
      }
      return state;
    });
  },
};
