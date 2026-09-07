import { WorldState, Entity, Operation } from './types';

export function applyOperation(state: WorldState, operation: Operation): WorldState {
  switch (operation.type) {
    case 'reset':
      return {
        entities: {
          zef: { name: 'zef', state: 'kok' },
          tal: { name: 'tal', state: 'kok' },
        },
      };

    case 'kindle':
      if (!operation.entity) {
        throw new Error('kindle operation requires entity');
      }
      return {
        ...state,
        entities: {
          ...state.entities,
          [operation.entity]: {
            ...state.entities[operation.entity],
            state: 'pex',
          },
        },
      };

    case 'kindleBoth':
      return {
        ...state,
        entities: {
          ...state.entities,
          zef: {
            ...state.entities.zef,
            state: 'pex',
          },
          tal: {
            ...state.entities.tal,
            state: 'pex',
          },
        },
      };

    default:
      return state;
  }
}
