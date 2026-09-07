import { WorldProtocol, Operation, EntityState, AbstractSnapshot } from './vok/types';
import { applyRules } from './vok/rules';

const initialState: Record<string, EntityState> = {
  Zef: { state: 'nim' }
};

let currentState: Record<string, EntityState> = { ...initialState };

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = { ...initialState };
  },

  applyOperation(op: Operation): void {
    currentState = applyRules(currentState, op);
  },

  getEntityState(entityName: string): EntityState | undefined {
    return currentState[entityName];
  },

  toAbstractSnapshot(): AbstractSnapshot {
    return {
      entities: { ...currentState },
      timestamp: Date.now()
    };
  }
};
