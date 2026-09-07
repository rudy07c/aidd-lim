import type { Entity, Operation, WorldState } from './types';

export const initialState: WorldState = {
  entities: {
    Tal: { id: 'Tal', name: 'Tal', position: 'nim' },
    Osk: { id: 'Osk', name: 'Osk', position: 'nim' },
  },
};

export const operations: Record<string, Operation> = {
  advanceTal: {
    name: 'advanceTal',
    description: 'Advance Tal from nim to pex',
    validate: (state: WorldState) => {
      const tal = state.entities['Tal'];
      return tal && tal.position === 'nim';
    },
    apply: (state: WorldState): WorldState => {
      return {
        entities: {
          ...state.entities,
          Tal: {
            ...state.entities['Tal'],
            position: 'pex',
          },
        },
      };
    },
  },
  advanceOsk: {
    name: 'advanceOsk',
    description: 'Advance Osk from nim to pex',
    validate: (state: WorldState) => {
      const osk = state.entities['Osk'];
      return osk && osk.position === 'nim';
    },
    apply: (state: WorldState): WorldState => {
      return {
        entities: {
          ...state.entities,
          Osk: {
            ...state.entities['Osk'],
            position: 'pex',
          },
        },
      };
    },
  },
  advanceTalOsk: {
    name: 'advanceTalOsk',
    description: 'Advance both Tal and Osk simultaneously from nim to pex',
    validate: (state: WorldState) => {
      const tal = state.entities['Tal'];
      const osk = state.entities['Osk'];
      return (
        tal &&
        tal.position === 'nim' &&
        osk &&
        osk.position === 'nim'
      );
    },
    apply: (state: WorldState): WorldState => {
      return {
        entities: {
          ...state.entities,
          Tal: {
            ...state.entities['Tal'],
            position: 'pex',
          },
          Osk: {
            ...state.entities['Osk'],
            position: 'pex',
          },
        },
      };
    },
  },
};
