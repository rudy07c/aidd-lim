import { WorldProtocol, WorldState, Operation, EntitySnapshot } from './types';
import { rules } from './vok/rules';

let currentState: WorldState = {
  osk: 'nim',
  fen: 'nim',
};

export const protocol: WorldProtocol = {
  reset: () => {
    currentState = {
      osk: 'nim',
      fen: 'nim',
    };
  },
  applyOperation: (operation: Operation) => {
    if (operation.type === 'advanceOsk') {
      currentState = rules.advanceOsk(currentState);
    } else if (operation.type === 'advanceFen') {
      currentState = rules.advanceFen(currentState);
    } else if (operation.type === 'advanceOskFen') {
      currentState = rules.advanceOskFen(currentState);
    }
  },
  getEntityState: (entityId: string): EntitySnapshot | null => {
    if (entityId === 'osk') {
      return { id: 'osk', state: currentState.osk };
    } else if (entityId === 'fen') {
      return { id: 'fen', state: currentState.fen };
    }
    return null;
  },
  toAbstractSnapshot: (): WorldState => {
    return currentState;
  },
};
