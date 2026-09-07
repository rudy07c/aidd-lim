import type { WorldProtocol, WorldSnapshot, EntityState } from './vok/types';
import { rules } from './vok/rules';

export const protocol: WorldProtocol = {
  reset: () => rules.reset.apply({ entities: { Tal: { stage: 'nim' }, Fen: { stage: 'nim' } } }),
  applyOperation: (state: WorldSnapshot, operationName: string): WorldSnapshot => {
    const operation = rules[operationName];
    if (!operation) {
      throw new Error(`Unknown operation: ${operationName}`);
    }
    return operation.apply(state);
  },
  getEntityState: (state: WorldSnapshot, entityName: string): EntityState => {
    const entity = state.entities[entityName];
    if (!entity) {
      throw new Error(`Unknown entity: ${entityName}`);
    }
    return entity;
  },
  toAbstractSnapshot: (state: WorldSnapshot): Record<string, unknown> => ({
    entities: Object.entries(state.entities).reduce(
      (acc, [name, entity]) => ({
        ...acc,
        [name]: entity,
      }),
      {},
    ),
  }),
};
