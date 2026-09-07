import { WorldProtocol, Operation, EntityState } from '../types';

export const rules = {
  entities: ['Zef', 'Tal'],
  states: ['dormant', 'pex'],
  initialState: 'dormant',
  operations: {
    kindleZef: {
      actors: ['Zef'],
      target: 'pex',
      description: 'Advance Zef to pex'
    },
    kindleTal: {
      actors: ['Tal'],
      target: 'pex',
      description: 'Advance Tal to pex'
    },
    kindleBoth: {
      actors: ['Zef', 'Tal'],
      target: 'pex',
      description: 'Advance both Zef and Tal to pex simultaneously'
    }
  }
};
