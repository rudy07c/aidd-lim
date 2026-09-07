import { VokState, VokOperation, canApplyOperation, applyVokOperation } from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: VokOperation) => boolean;
  getEntityState: (entity: string) => string | null;
  toAbstractSnapshot: () => VokState;
}

let currentState: VokState = { vok: 'nim', fen: 'nim' };

/**
 * Reset the state to initial
 */
function reset(): void {
  currentState = { vok: 'nim', fen: 'nim' };
}

/**
 * Apply an operation to the current state
 */
function applyOperation(operation: VokOperation): boolean {
  if (!canApplyOperation(currentState, operation)) {
    return false;
  }
  currentState = applyVokOperation(currentState, operation);
  return true;
}

/**
 * Get the state of a specific entity
 */
function getEntityState(entity: string): string | null {
  if (entity === 'vok') {
    return currentState.vok;
  }
  if (entity === 'fen') {
    return currentState.fen;
  }
  return null;
}

/**
 * Get the current abstract snapshot
 */
function toAbstractSnapshot(): VokState {
  return { ...currentState };
}

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
