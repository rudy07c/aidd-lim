import { WorldProtocol, Operation, AbstractSnapshot } from './types';
import { vokRules } from './vok/rules';

interface InternalState {
  entities: Map<string, any>;
}

const internalState: InternalState = {
  entities: new Map(),
};

const reset = (): void => {
  internalState.entities.clear();
  internalState.entities.set('vok', {
    name: 'vok',
    state: 'nim',
  });
};

const applyOperation = (operation: Operation): void => {
  if (operation.type === 'setEntityState') {
    const entity = internalState.entities.get(operation.entity);
    if (entity) {
      internalState.entities.set(operation.entity, {
        ...entity,
        state: operation.state.state,
      });
    }
  }
};

const getEntityState = (entityName: string): any => {
  return internalState.entities.get(entityName);
};

const toAbstractSnapshot = (): AbstractSnapshot => {
  const snapshot: AbstractSnapshot = {};
  internalState.entities.forEach((entity, name) => {
    snapshot[name] = entity;
  });
  return snapshot;
};

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
