import {
  WorldState,
  EntityState,
  Operation,
  OPERATIONS,
  createInitialState,
  applyRuleOperation,
  getEntityStateFromWorld,
  toAbstractSnapshot as ruleToAbstractSnapshot,
} from './vok/rules';

export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: Operation) => void;
  getEntityState: (entityId: string) => EntityState | undefined;
  toAbstractSnapshot: () => object;
}

// Internal mutable state
let currentState: WorldState = createInitialState();

// Protocol implementation
export const protocol: WorldProtocol = {
  reset(): void {
    currentState = createInitialState();
  },

  applyOperation(operation: Operation): void {
    currentState = applyRuleOperation(currentState, operation);
  },

  getEntityState(entityId: string): EntityState | undefined {
    return getEntityStateFromWorld(currentState, entityId);
  },

  toAbstractSnapshot(): object {
    return ruleToAbstractSnapshot(currentState);
  },
};

// Helper functions for creating operations
export function createMoveFenOperation(): Operation {
  return {
    type: OPERATIONS.MOVE_FEN,
  };
}

export function createJumpFenOperation(): Operation {
  return {
    type: OPERATIONS.JUMP_FEN,
  };
}

export function createResetOperation(): Operation {
  return {
    type: OPERATIONS.RESET,
  };
}
