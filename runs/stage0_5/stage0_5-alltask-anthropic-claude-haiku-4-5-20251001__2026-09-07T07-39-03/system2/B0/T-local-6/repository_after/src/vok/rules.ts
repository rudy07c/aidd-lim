export type OperationType = 'initiateFen' | 'progressFen' | 'recoverFen';

export interface Operation {
  type: OperationType;
  timestamp: number;
}

export interface WorldState {
  fenStage: 'pex' | 'dor' | null;
  lastOperationTime: number;
}

export const INITIAL_STATE: WorldState = {
  fenStage: null,
  lastOperationTime: 0,
};

export function applyRule(
  state: WorldState,
  operation: Operation
): WorldState {
  switch (operation.type) {
    case 'initiateFen':
      return {
        ...state,
        fenStage: 'pex',
        lastOperationTime: operation.timestamp,
      };

    case 'progressFen':
      if (state.fenStage === 'pex') {
        return {
          ...state,
          fenStage: 'dor',
          lastOperationTime: operation.timestamp,
        };
      }
      return state;

    case 'recoverFen':
      if (state.fenStage === 'dor') {
        return {
          ...state,
          fenStage: 'pex',
          lastOperationTime: operation.timestamp,
        };
      }
      return state;

    default:
      return state;
  }
}
