import { VokState, VokOperation, applyVokOperation, getInitialVokState } from './vok/rules';

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: VokOperation): void;
  getEntityState(): VokState;
  toAbstractSnapshot(): VokState;
}

let currentState: VokState = getInitialVokState();

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = getInitialVokState();
  },
  
  applyOperation(operation: VokOperation): void {
    currentState = applyVokOperation(currentState, operation);
  },
  
  getEntityState(): VokState {
    return currentState;
  },
  
  toAbstractSnapshot(): VokState {
    return { ...currentState };
  }
};
