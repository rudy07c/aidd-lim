import { createVokRules } from './vok/rules';

export interface WorldProtocol {
  reset(): void;
  applyOperation(operationName: string, payload?: any): void;
  getEntityState(entityId: string): any;
  toAbstractSnapshot(): any;
}

const vokRules = createVokRules();

const entities: Map<string, any> = new Map();

export const protocol: WorldProtocol = {
  reset(): void {
    entities.clear();
  },

  applyOperation(operationName: string, payload?: any): void {
    if (operationName === 'advanceVok') {
      const entity = entities.get('vok') || { state: 'pex', energy: 10 };
      entities.set('vok', vokRules.advanceVok(entity));
    } else if (operationName === 'advanceVokSkip') {
      const entity = entities.get('vok') || { state: 'pex', energy: 10 };
      entities.set('vok', vokRules.advanceVokSkip(entity));
    }
  },

  getEntityState(entityId: string): any {
    return entities.get(entityId);
  },

  toAbstractSnapshot(): any {
    const snapshot: any = {};
    entities.forEach((value, key) => {
      snapshot[key] = value;
    });
    return snapshot;
  },
};
