import { Zef, ZefRules } from './vok/rules';

export interface WorldProtocol {
  reset(): void;
  applyOperation(operationName: string, ...args: any[]): void;
  getEntityState(entityId: string): any;
  toAbstractSnapshot(): any;
}

const state: {
  entities: Record<string, any>;
} = {
  entities: {},
};

const initializeEntity = (entityId: string) => {
  if (!state.entities[entityId]) {
    state.entities[entityId] = {
      zef: ZefRules.initial,
    };
  }
};

export const protocol: WorldProtocol = {
  reset(): void {
    state.entities = {};
  },

  applyOperation(operationName: string, ...args: any[]): void {
    const [entityId, ...operationArgs] = args;

    if (operationName === 'recoverZef') {
      initializeEntity(entityId);
      const currentZef = state.entities[entityId].zef as Zef;

      // Zef が 'dor' 状態の場合、'pex' に戻す
      if (currentZef === 'dor') {
        if (ZefRules.canTransition(currentZef, 'pex')) {
          state.entities[entityId].zef = 'pex';
        }
      }
    }
  },

  getEntityState(entityId: string): any {
    initializeEntity(entityId);
    return { ...state.entities[entityId] };
  },

  toAbstractSnapshot(): any {
    const snapshot: Record<string, any> = {};
    for (const [entityId, entityState] of Object.entries(state.entities)) {
      snapshot[entityId] = { ...entityState };
    }
    return snapshot;
  },
};
