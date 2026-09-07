import { EntityState, Operation, WorldProtocol, AbstractSnapshot } from './types';
import { rules } from './vok/rules';

let currentState: EntityState = rules.getInitialState();
const operationHistory: Operation[] = [];

function reset(): void {
  currentState = rules.getInitialState();
  operationHistory.length = 0;
}

function applyOperation(operation: Operation): void {
  currentState = rules.applyOperation(currentState, operation);
  operationHistory.push(operation);
}

function getEntityState(): EntityState {
  return { ...currentState };
}

function toAbstractSnapshot(): AbstractSnapshot {
  return {
    state: { ...currentState },
    operations: [...operationHistory],
  };
}

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
