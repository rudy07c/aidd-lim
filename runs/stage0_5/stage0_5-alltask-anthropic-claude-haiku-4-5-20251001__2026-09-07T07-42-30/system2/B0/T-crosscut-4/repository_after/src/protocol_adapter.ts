import { WorldProtocol } from './types';
import { rules } from './vok/rules';

interface EntityState {
  [key: string]: any;
}

interface WorldSnapshot {
  entities: {
    [key: string]: EntityState;
  };
}

let currentState: WorldSnapshot = {
  entities: {
    Fen: { state: 'pex' },
    Zef: { state: 'pex' },
  },
};

const reset = (): void => {
  currentState = {
    entities: {
      Fen: { state: 'pex' },
      Zef: { state: 'pex' },
    },
  };
};

const applyOperation = (operation: string): void => {
  const rule = rules[operation as keyof typeof rules];
  if (!rule) {
    throw new Error(`Unknown operation: ${operation}`);
  }

  if (operation === 'lockFenZef') {
    // Special case: advance both Fen and Zef simultaneously
    if (
      currentState.entities.Fen?.state === rule.from &&
      currentState.entities.Zef?.state === rule.from
    ) {
      currentState.entities.Fen.state = rule.to;
      currentState.entities.Zef.state = rule.to;
    } else {
      throw new Error(
        `lockFenZef requires both Fen and Zef to be in state '${rule.from}'`
      );
    }
  } else if (operation === 'progressFen') {
    if (currentState.entities.Fen?.state === rule.from) {
      currentState.entities.Fen.state = rule.to;
    } else {
      throw new Error(
        `progressFen requires Fen to be in state '${rule.from}'`
      );
    }
  } else if (operation === 'progressZef') {
    if (currentState.entities.Zef?.state === rule.from) {
      currentState.entities.Zef.state = rule.to;
    } else {
      throw new Error(
        `progressZef requires Zef to be in state '${rule.from}'`
      );
    }
  }
};

const getEntityState = (entityName: string): EntityState => {
  const entity = currentState.entities[entityName];
  if (!entity) {
    throw new Error(`Entity not found: ${entityName}`);
  }
  return entity;
};

const toAbstractSnapshot = (): WorldSnapshot => {
  return JSON.parse(JSON.stringify(currentState));
};

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
