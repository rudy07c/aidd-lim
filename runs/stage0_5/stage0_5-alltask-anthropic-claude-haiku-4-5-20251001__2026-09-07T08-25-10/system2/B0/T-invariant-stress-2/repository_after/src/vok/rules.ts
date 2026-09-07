import { WorldProtocol, Operation, EntityState } from '../types';

export interface FenState {
  value: 'nim' | 'pex' | 'dor';
}

export interface GameEntity {
  fen: FenState;
}

// Define the operations that can be applied
export const operations = {
  // Move from 'nim' to 'pex'
  advanceFen: {
    name: 'advanceFen',
    apply: (state: GameEntity): GameEntity => {
      if (state.fen.value === 'nim') {
        return {
          ...state,
          fen: { value: 'pex' }
        };
      }
      return state;
    }
  },
  // Move from 'pex' to 'dor'
  completeFen: {
    name: 'completeFen',
    apply: (state: GameEntity): GameEntity => {
      if (state.fen.value === 'pex') {
        return {
          ...state,
          fen: { value: 'dor' }
        };
      }
      return state;
    }
  },
  // Jump directly from 'nim' to 'dor', bypassing 'pex'
  jumpFen: {
    name: 'jumpFen',
    apply: (state: GameEntity): GameEntity => {
      if (state.fen.value === 'nim') {
        return {
          ...state,
          fen: { value: 'dor' }
        };
      }
      return state;
    }
  }
};

export function isFenState(value: any): value is FenState {
  return (
    value &&
    typeof value === 'object' &&
    (value.value === 'nim' || value.value === 'pex' || value.value === 'dor')
  );
}

export function isGameEntity(value: any): value is GameEntity {
  return (
    value &&
    typeof value === 'object' &&
    'fen' in value &&
    isFenState(value.fen)
  );
}