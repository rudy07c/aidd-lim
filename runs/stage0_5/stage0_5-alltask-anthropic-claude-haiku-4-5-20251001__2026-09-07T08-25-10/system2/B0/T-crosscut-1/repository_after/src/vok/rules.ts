import { WorldState } from './types';

export interface Operation {
  type: string;
  [key: string]: any;
}

export interface OperationResult {
  success: boolean;
  newState?: WorldState;
  error?: string;
}

// Define valid operation types
type OperationType = 
  | 'kindle'
  | 'kindleBoth'
  | 'reset';

export const VALID_OPERATIONS: Set<OperationType> = new Set([
  'kindle',
  'kindleBoth',
  'reset',
]);

export function validateOperation(op: Operation): boolean {
  if (!op.type || typeof op.type !== 'string') {
    return false;
  }
  return VALID_OPERATIONS.has(op.type as OperationType);
}

export function applyRules(state: WorldState, operation: Operation): OperationResult {
  if (!validateOperation(operation)) {
    return {
      success: false,
      error: `Invalid operation type: ${operation.type}`,
    };
  }

  switch (operation.type) {
    case 'reset':
      return handleReset(state);
    case 'kindle':
      return handleKindle(state, operation);
    case 'kindleBoth':
      return handleKindleBoth(state, operation);
    default:
      return {
        success: false,
        error: `Unknown operation type: ${operation.type}`,
      };
  }
}

function handleReset(state: WorldState): OperationResult {
  const newState: WorldState = {
    zef: 'void',
    tal: 'void',
  };
  return {
    success: true,
    newState,
  };
}

function handleKindle(state: WorldState, operation: Operation): OperationResult {
  const { entity } = operation;

  if (!entity || (entity !== 'zef' && entity !== 'tal')) {
    return {
      success: false,
      error: `Invalid entity: ${entity}. Must be 'zef' or 'tal'.`,
    };
  }

  const currentState = state[entity as keyof WorldState];
  if (currentState === 'pex') {
    return {
      success: false,
      error: `${entity} is already at pex state.`,
    };
  }

  const newState = { ...state };
  newState[entity as keyof WorldState] = 'pex';

  return {
    success: true,
    newState,
  };
}

function handleKindleBoth(state: WorldState, operation: Operation): OperationResult {
  // Check if either is already at pex
  if (state.zef === 'pex' && state.tal === 'pex') {
    return {
      success: false,
      error: 'Both zef and tal are already at pex state.',
    };
  }

  // Check if at least one can be advanced
  if (state.zef === 'pex' || state.tal === 'pex') {
    return {
      success: false,
      error: 'Both entities must be in the same state (not pex) to use kindleBoth.',
    };
  }

  const newState: WorldState = {
    zef: 'pex',
    tal: 'pex',
  };

  return {
    success: true,
    newState,
  };
}
