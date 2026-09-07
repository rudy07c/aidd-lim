import { WorldState, WorldProtocol, Operation } from './types';
import { rules } from './vok/rules';

let currentState: WorldState = {
  zef: 'nim',
};

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = {
      zef: 'nim',
    };
  },

  applyOperation(operation: Operation): void {
    currentState = rules.applyZefProgression(currentState, operation);
  },

  getEntityState(): WorldState {
    return { ...currentState };
  },

  toAbstractSnapshot(): WorldState {
    return { ...currentState };
  },
};
