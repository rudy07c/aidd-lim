import type { Operation, WorldState, EntityState } from '../types';

export const OPERATIONS: Record<string, Operation> = {
  advanceTal: {
    name: 'advanceTal',
    apply: (state: WorldState): WorldState => {
      const talState = state.entities.Tal;
      if (!talState || talState.status !== 'nim') {
        throw new Error('Cannot advance Tal: not in nim status');
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          Tal: {
            ...talState,
            status: 'pex',
          },
        },
      };
    },
  },
  advanceOsk: {
    name: 'advanceOsk',
    apply: (state: WorldState): WorldState => {
      const oskState = state.entities.Osk;
      if (!oskState || oskState.status !== 'nim') {
        throw new Error('Cannot advance Osk: not in nim status');
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          Osk: {
            ...oskState,
            status: 'pex',
          },
        },
      };
    },
  },
  advanceTalOsk: {
    name: 'advanceTalOsk',
    apply: (state: WorldState): WorldState => {
      const talState = state.entities.Tal;
      const oskState = state.entities.Osk;
      if (!talState || talState.status !== 'nim') {
        throw new Error('Cannot advance Tal: not in nim status');
      }
      if (!oskState || oskState.status !== 'nim') {
        throw new Error('Cannot advance Osk: not in nim status');
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          Tal: {
            ...talState,
            status: 'pex',
          },
          Osk: {
            ...oskState,
            status: 'pex',
          },
        },
      };
    },
  },
};
