import { Operation, WorldState } from '../types';

export const rules = {
  advanceOsk: (state: WorldState): WorldState => {
    return {
      ...state,
      osk: state.osk === 'nim' ? 'pex' : state.osk,
    };
  },
  advanceFen: (state: WorldState): WorldState => {
    return {
      ...state,
      fen: state.fen === 'nim' ? 'pex' : state.fen,
    };
  },
  advanceOskFen: (state: WorldState): WorldState => {
    return {
      ...state,
      osk: state.osk === 'nim' ? 'pex' : state.osk,
      fen: state.fen === 'nim' ? 'pex' : state.fen,
    };
  },
};
