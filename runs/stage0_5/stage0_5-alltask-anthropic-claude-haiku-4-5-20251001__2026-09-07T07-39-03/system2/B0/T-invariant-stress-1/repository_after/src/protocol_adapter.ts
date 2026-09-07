import { rules } from './vok/rules';

export interface EntityState {
  zef: string;
  [key: string]: any;
}

export interface Operation {
  type: string;
  [key: string]: any;
}

export interface AbstractSnapshot {
  entities: { [key: string]: EntityState };
}

export interface WorldProtocol {
  reset: (entityId: string) => void;
  applyOperation: (entityId: string, operation: Operation) => void;
  getEntityState: (entityId: string) => EntityState | undefined;
  toAbstractSnapshot: () => AbstractSnapshot;
}

const entities: { [key: string]: EntityState } = {};

export const protocol: WorldProtocol = {
  reset: (entityId: string) => {
    entities[entityId] = rules.reset({ zef: 'nim' });
  },

  applyOperation: (entityId: string, operation: Operation) => {
    if (!entities[entityId]) {
      entities[entityId] = { zef: 'nim' };
    }

    const state = entities[entityId];

    switch (operation.type) {
      case 'advanceZef':
        entities[entityId] = rules.advanceZef(state);
        break;
      case 'fastTrackZef':
        entities[entityId] = rules.fastTrackZef(state);
        break;
      case 'reset':
        entities[entityId] = rules.reset(state);
        break;
      default:
        break;
    }
  },

  getEntityState: (entityId: string) => {
    return entities[entityId];
  },

  toAbstractSnapshot: () => {
    return {
      entities: { ...entities },
    };
  },
};
