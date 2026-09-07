import { WorldProtocol, Operation, AbstractSnapshot, EntityState } from './types';
import { applyRules } from './vok/rules';

interface InternalState {
  vok: string;
  zef: string;
  [key: string]: string;
}

let internalState: InternalState = {
  vok: 'pex',
  zef: 'pex',
};

function reset(): void {
  internalState = {
    vok: 'pex',
    zef: 'pex',
  };
}

function applyOperation(op: Operation): void {
  switch (op.type) {
    case 'moveVok':
      internalState.vok = op.target;
      break;
    case 'moveZef':
      internalState.zef = op.target;
      break;
    case 'turboVokZef':
      internalState.vok = op.target;
      internalState.zef = op.target;
      break;
    default:
      const _exhaustive: never = op;
      return _exhaustive;
  }
}

function getEntityState(entity: string): EntityState {
  const state = internalState[entity];
  if (state === undefined) {
    throw new Error(`Unknown entity: ${entity}`);
  }
  return { entity, state };
}

function toAbstractSnapshot(): AbstractSnapshot {
  return applyRules({
    vok: internalState.vok,
    zef: internalState.zef,
  });
}

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot,
};
