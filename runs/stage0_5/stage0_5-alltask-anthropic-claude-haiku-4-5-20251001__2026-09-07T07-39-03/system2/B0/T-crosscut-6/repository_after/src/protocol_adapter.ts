import { WorldProtocol, Operation, EntityState, AbstractSnapshot } from './types';
import { rules } from './vok/rules';

interface InternalState {
  vok: EntityState;
  fen: EntityState;
}

let state: InternalState = {
  vok: { location: 'nim' },
  fen: { location: 'nim' },
};

const operationHandlers: Record<string, (payload: any, state: InternalState) => void> = {
  moveVok: (payload, state) => {
    if (state.vok.location === payload.from) {
      state.vok.location = payload.to;
    }
  },
  moveFen: (payload, state) => {
    if (state.fen.location === payload.from) {
      state.fen.location = payload.to;
    }
  },
  jumpVokFen: (payload, state) => {
    if (state.vok.location === payload.from && state.fen.location === payload.from) {
      state.vok.location = payload.to;
      state.fen.location = payload.to;
    }
  },
};

export const protocol: WorldProtocol = {
  reset: () => {
    state = {
      vok: { location: 'nim' },
      fen: { location: 'nim' },
    };
  },

  applyOperation: (operation: Operation) => {
    const handler = operationHandlers[operation.type];
    if (handler) {
      handler(operation.payload, state);
    }
  },

  getEntityState: (entityId: string): EntityState | undefined => {
    return state[entityId as keyof InternalState];
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      vok: state.vok,
      fen: state.fen,
    };
  },
};
