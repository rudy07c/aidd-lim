import { Operation, Entity, WorldState } from '../types';

export const rules = {
  validateOperation: (op: Operation, state: WorldState): boolean => {
    switch (op.type) {
      case 'initWorld':
        return true;
      case 'moveFenToDor':
        return state.entities.some(e => e.id === 'fen' && e.location === 'pex');
      case 'recoverFen':
        return state.entities.some(e => e.id === 'fen' && e.location === 'dor');
      default:
        return false;
    }
  },

  applyOperation: (op: Operation, state: WorldState): WorldState => {
    switch (op.type) {
      case 'initWorld':
        return {
          ...state,
          entities: [
            { id: 'fen', location: 'pex' },
          ],
        };
      case 'moveFenToDor':
        return {
          ...state,
          entities: state.entities.map(e =>
            e.id === 'fen' ? { ...e, location: 'dor' } : e
          ),
        };
      case 'recoverFen':
        return {
          ...state,
          entities: state.entities.map(e =>
            e.id === 'fen' ? { ...e, location: 'pex' } : e
          ),
        };
      default:
        return state;
    }
  },
};
