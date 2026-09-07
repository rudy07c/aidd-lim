// Vok and Fen state machine rules

export interface VokState {
  vok: string;
  fen: string;
}

export type VokOperation =
  | { type: 'advanceVok' }
  | { type: 'advanceFen' }
  | { type: 'jumpVokFen' };

/**
 * Validates if an operation can be applied to the current state
 */
export function canApplyOperation(state: VokState, operation: VokOperation): boolean {
  switch (operation.type) {
    case 'advanceVok':
      return state.vok === 'nim';
    case 'advanceFen':
      return state.fen === 'nim';
    case 'jumpVokFen':
      return state.vok === 'nim' && state.fen === 'nim';
    default:
      return false;
  }
}

/**
 * Applies an operation to the current state, returning the new state.
 * Assumes the operation is valid (call canApplyOperation first)
 */
export function applyVokOperation(state: VokState, operation: VokOperation): VokState {
  switch (operation.type) {
    case 'advanceVok':
      return { ...state, vok: 'pex' };
    case 'advanceFen':
      return { ...state, fen: 'pex' };
    case 'jumpVokFen':
      return { vok: 'dor', fen: 'dor' };
    default:
      return state;
  }
}
