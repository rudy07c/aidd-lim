import { WorldProtocol, WorldState, Operation } from './types';
import { rules } from './vok/rules';

let currentState: WorldState = {
  vok: 'nim',
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      vok: 'nim',
    };
  },

  applyOperation: (operation: Operation) => {
    const rule = rules[operation.type as keyof typeof rules];
    if (!rule) {
      throw new Error(`Unknown operation: ${operation.type}`);
    }

    if (!rule.validate(currentState)) {
      throw new Error(
        `Operation ${operation.type} is not valid in current state`
      );
    }

    currentState = rule.apply(currentState);
  },

  getEntityState: (entity: string) => {
    if (entity === 'vok') {
      return currentState.vok;
    }
    throw new Error(`Unknown entity: ${entity}`);
  },

  toAbstractSnapshot: () => {
    return {
      entities: {
        vok: currentState.vok,
      },
    };
  },
};
