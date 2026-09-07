// Rules for the Vok world

export interface WorldState {
  fen: 'nim' | 'pex' | 'dor';
  entityStates: Map<string, EntityState>;
}

export interface EntityState {
  id: string;
  position: { x: number; y: number };
  health: number;
  active: boolean;
}

export interface Operation {
  type: string;
  payload?: unknown;
}

// Available operations
export const OPERATIONS = {
  MOVE_FEN: 'moveFen',
  JUMP_FEN: 'jumpFen',
  RESET: 'reset',
} as const;

// Initial state
export function createInitialState(): WorldState {
  return {
    fen: 'nim',
    entityStates: new Map(),
  };
}

// Apply operation to world state
export function applyRuleOperation(
  state: WorldState,
  operation: Operation
): WorldState {
  const newState = { ...state, entityStates: new Map(state.entityStates) };

  switch (operation.type) {
    case OPERATIONS.MOVE_FEN:
      // Progressive state transition: nim -> pex -> dor
      if (newState.fen === 'nim') {
        newState.fen = 'pex';
      } else if (newState.fen === 'pex') {
        newState.fen = 'dor';
      }
      break;

    case OPERATIONS.JUMP_FEN:
      // Direct jump from nim to dor, bypassing pex
      if (newState.fen === 'nim') {
        newState.fen = 'dor';
      }
      break;

    case OPERATIONS.RESET:
      return createInitialState();

    default:
      throw new Error(`Unknown operation type: ${operation.type}`);
  }

  return newState;
}

// Get entity state
export function getEntityStateFromWorld(
  state: WorldState,
  entityId: string
): EntityState | undefined {
  return state.entityStates.get(entityId);
}

// Convert to abstract snapshot
export function toAbstractSnapshot(state: WorldState): object {
  return {
    fen: state.fen,
    entityCount: state.entityStates.size,
    entities: Array.from(state.entityStates.values()),
  };
}
