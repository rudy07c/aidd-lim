import type { WorldProtocol, Operation, WorldState, EntityState, AbstractSnapshot } from './types';
import { vokRules, zefRules, turboVokZefTransition } from './vok/rules';

const initialState: WorldState = {
  entities: {
    Vok: { state: 'pex' },
    Zef: { state: 'pex' },
  },
};

let currentState: WorldState = { ...initialState };

export const protocol: WorldProtocol = {
  reset(): void {
    currentState = JSON.parse(JSON.stringify(initialState));
  },

  applyOperation(operation: Operation): void {
    if (operation.type === 'advanceVok') {
      const vokState = currentState.entities.Vok.state;
      const nextState = vokRules.transitions[vokState];
      if (nextState) {
        currentState.entities.Vok.state = nextState;
      }
    } else if (operation.type === 'advanceZef') {
      const zefState = currentState.entities.Zef.state;
      const nextState = zefRules.transitions[zefState];
      if (nextState) {
        currentState.entities.Zef.state = nextState;
      }
    } else if (operation.type === 'turboVokZef') {
      const vokState = currentState.entities.Vok.state;
      const zefState = currentState.entities.Zef.state;
      
      if (vokState === turboVokZefTransition.vok.from && zefState === turboVokZefTransition.zef.from) {
        currentState.entities.Vok.state = turboVokZefTransition.vok.to;
        currentState.entities.Zef.state = turboVokZefTransition.zef.to;
      }
    }
  },

  getEntityState(entityName: string): EntityState | null {
    return currentState.entities[entityName] || null;
  },

  toAbstractSnapshot(): AbstractSnapshot {
    return {
      Vok: currentState.entities.Vok?.state || 'unknown',
      Zef: currentState.entities.Zef?.state || 'unknown',
    };
  },
};
