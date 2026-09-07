import { WorldProtocol, WorldState, Operation } from './types';
import { advanceTalOsk } from './vok/rules';

let currentState: WorldState = {
  entities: [
    { name: 'Tal', location: 'nim' },
    { name: 'Osk', location: 'nim' }
  ]
};

const operations: { [key: string]: Operation } = {
  advanceTalOsk
};

export const protocol: WorldProtocol = {
  reset: (initialState?: WorldState) => {
    currentState = initialState || {
      entities: [
        { name: 'Tal', location: 'nim' },
        { name: 'Osk', location: 'nim' }
      ]
    };
  },
  
  applyOperation: (operationName: string, params?: any) => {
    const operation = operations[operationName];
    
    if (!operation) {
      throw new Error(`Operation not found: ${operationName}`);
    }
    
    const validation = operation.validate(currentState);
    if (!validation.valid) {
      throw new Error(`Operation validation failed: ${validation.reason}`);
    }
    
    currentState = operation.apply(currentState);
    return currentState;
  },
  
  getEntityState: (entityName: string) => {
    const entity = currentState.entities.find(e => e.name === entityName);
    return entity || null;
  },
  
  toAbstractSnapshot: () => {
    return {
      ...currentState,
      timestamp: new Date().toISOString()
    };
  }
};
