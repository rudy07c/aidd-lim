import { WorldProtocol, Operation, GameState, EntityState } from '../protocol_adapter';

// Define Fen states
export type FenState = 'nim' | 'pex' | 'dor';

// Define operations
export type OperationType = 'applyFen' | 'jumpFen';

export interface ApplyFenOp extends Operation {
  type: 'applyFen';
  entityId: string;
}

export interface JumpFenOp extends Operation {
  type: 'jumpFen';
  entityId: string;
}

// Rules for state transitions
export const fenRules = {
  // Progress Fen from 'nim' -> 'pex' -> 'dor'
  applyFen: (state: GameState, op: ApplyFenOp): GameState => {
    const entity = state.entities[op.entityId];
    if (!entity) return state;

    const currentFen = (entity.fen as FenState) || 'nim';
    let nextFen: FenState;

    switch (currentFen) {
      case 'nim':
        nextFen = 'pex';
        break;
      case 'pex':
        nextFen = 'dor';
        break;
      case 'dor':
        return state; // Already at final state
      default:
        return state;
    }

    return {
      ...state,
      entities: {
        ...state.entities,
        [op.entityId]: {
          ...entity,
          fen: nextFen,
        },
      },
    };
  },

  // Jump Fen directly from 'nim' to 'dor'
  jumpFen: (state: GameState, op: JumpFenOp): GameState => {
    const entity = state.entities[op.entityId];
    if (!entity) return state;

    const currentFen = (entity.fen as FenState) || 'nim';

    // Only allow jumping from 'nim' state
    if (currentFen !== 'nim') {
      return state;
    }

    return {
      ...state,
      entities: {
        ...state.entities,
        [op.entityId]: {
          ...entity,
          fen: 'dor',
        },
      },
    };
  },
};
