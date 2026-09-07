export interface GameState {
  fen: string;
}

export const INITIAL_STATE: GameState = {
  fen: 'base'
};

export interface Operation {
  type: string;
  [key: string]: any;
}

export function applyGameOperation(state: GameState, operation: Operation): GameState {
  switch (operation.type) {
    case 'advanceFen':
      return advanceFen(state);
    case 'recoverFen':
      return recoverFen(state);
    default:
      return state;
  }
}

function advanceFen(state: GameState): GameState {
  if (state.fen === 'base') {
    return { fen: 'pex' };
  }
  if (state.fen === 'pex') {
    return { fen: 'dor' };
  }
  return state;
}

function recoverFen(state: GameState): GameState {
  if (state.fen === 'dor') {
    return { fen: 'pex' };
  }
  return state;
}
