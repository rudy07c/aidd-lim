import { rules } from './vok/rules';

interface WorldProtocol {
  reset: () => any;
  applyOperation: (operationName: string, state: any) => any;
  getEntityState: (state: any, entityName: string) => any;
  toAbstractSnapshot: (state: any) => any;
}

let currentState = rules.initialState;

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = { ...rules.initialState };
    return currentState;
  },

  applyOperation: (operationName: string, state: any) => {
    const operation = rules.operations[operationName];
    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }
    if (!operation.validate(state)) {
      throw new Error(`Invalid state for operation: ${operationName}`);
    }
    const newState = operation.apply(state);
    currentState = newState;
    return newState;
  },

  getEntityState: (state: any, entityName: string) => {
    if (entityName === 'zef') {
      return state.zef;
    }
    if (entityName === 'fen') {
      return state.fen;
    }
    throw new Error(`Unknown entity: ${entityName}`);
  },

  toAbstractSnapshot: (state: any) => {
    return {
      zef: state.zef,
      fen: state.fen,
    };
  },
};
