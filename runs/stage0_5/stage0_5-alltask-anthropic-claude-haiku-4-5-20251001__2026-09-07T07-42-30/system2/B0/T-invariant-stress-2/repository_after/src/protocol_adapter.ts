import { fenRules, ApplyFenOp, JumpFenOp } from './vok/rules';

// Core type definitions
export interface Operation {
  type: string;
}

export interface EntityState {
  id: string;
  [key: string]: unknown;
  fen?: string;
}

export interface GameState {
  entities: { [key: string]: EntityState };
  [key: string]: unknown;
}

export interface WorldProtocol {
  reset(): void;
  applyOperation(op: Operation): void;
  getEntityState(entityId: string): EntityState | null;
  toAbstractSnapshot(): GameState;
}

// Internal state
let currentState: GameState = {
  entities: {},
};

// Protocol implementation
export const protocol: WorldProtocol = {
  reset(): void {
    currentState = {
      entities: {},
    };
  },

  applyOperation(op: Operation): void {
    switch (op.type) {
      case 'applyFen': {
        currentState = fenRules.applyFen(currentState, op as ApplyFenOp);
        break;
      }
      case 'jumpFen': {
        currentState = fenRules.jumpFen(currentState, op as JumpFenOp);
        break;
      }
      default:
        // Unknown operation type, ignore
        break;
    }
  },

  getEntityState(entityId: string): EntityState | null {
    return currentState.entities[entityId] || null;
  },

  toAbstractSnapshot(): GameState {
    return JSON.parse(JSON.stringify(currentState));
  },
};
