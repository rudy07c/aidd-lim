import { WorldProtocol } from '../protocol_adapter';

export type EntityId = 'osk' | 'fen';

export interface Entity {
  status: 'nim' | 'pex';
}

export interface WorldState {
  osk: Entity;
  fen: Entity;
}

export type Operation =
  | { type: 'reset' }
  | { type: 'advanceOsk' }
  | { type: 'advanceFen' }
  | { type: 'advanceOskFen' };

const initialState: WorldState = {
  osk: { status: 'nim' },
  fen: { status: 'nim' },
};

export function applyOperationImpl(state: WorldState, operation: Operation): WorldState {
  switch (operation.type) {
    case 'reset':
      return JSON.parse(JSON.stringify(initialState));
    case 'advanceOsk':
      return {
        ...state,
        osk: { status: state.osk.status === 'nim' ? 'pex' : 'nim' },
      };
    case 'advanceFen':
      return {
        ...state,
        fen: { status: state.fen.status === 'nim' ? 'pex' : 'nim' },
      };
    case 'advanceOskFen':
      return {
        ...state,
        osk: { status: state.osk.status === 'nim' ? 'pex' : 'nim' },
        fen: { status: state.fen.status === 'nim' ? 'pex' : 'nim' },
      };
    default:
      return state;
  }
}

export function getInitialState(): WorldState {
  return JSON.parse(JSON.stringify(initialState));
}
