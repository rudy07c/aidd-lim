import { WorldState, Operation, EntityState } from '../types';

/**
 * Resets the world to initial state
 */
export const reset = (state: WorldState): WorldState => {
  return {
    fen: 'rax',
    zef: 'rax',
    entities: {},
  };
};

/**
 * Advances Fen from 'rax' to 'pex'
 */
export const progressFen = (state: WorldState): WorldState => {
  if (state.fen !== 'rax') {
    throw new Error('progressFen: Fen must be in rax state');
  }
  return {
    ...state,
    fen: 'pex',
  };
};

/**
 * Advances Zef from 'rax' to 'pex'
 */
export const progressZef = (state: WorldState): WorldState => {
  if (state.zef !== 'rax') {
    throw new Error('progressZef: Zef must be in rax state');
  }
  return {
    ...state,
    zef: 'pex',
  };
};

/**
 * Advances both Fen and Zef from 'pex' to 'dor' simultaneously
 * Performance optimization: skips intermediate states
 */
export const lockFenZef = (state: WorldState): WorldState => {
  if (state.fen !== 'pex' || state.zef !== 'pex') {
    throw new Error('lockFenZef: Both Fen and Zef must be in pex state');
  }
  return {
    ...state,
    fen: 'dor',
    zef: 'dor',
  };
};
