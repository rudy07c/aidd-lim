import { World, Operation, applyOperation as applyOp } from './vok/rules';

export interface WorldProtocol {
  reset(): World;
  applyOperation(op: Operation): void;
  getEntityState(entity: 'tal' | 'fen'): string;
  toAbstractSnapshot(): { tal: string; fen: string };
}

let currentWorld: World = {
  tal: { position: 'nim' },
  fen: { position: 'nim' }
};

function resetWorld(): World {
  currentWorld = {
    tal: { position: 'nim' },
    fen: { position: 'nim' }
  };
  return currentWorld;
}

function applyOperationToWorld(op: Operation): void {
  currentWorld = applyOp(currentWorld, op);
}

function getEntityState(entity: 'tal' | 'fen'): string {
  return currentWorld[entity].position;
}

function toAbstractSnapshot(): { tal: string; fen: string } {
  return {
    tal: currentWorld.tal.position,
    fen: currentWorld.fen.position
  };
}

export const protocol: WorldProtocol = {
  reset: resetWorld,
  applyOperation: applyOperationToWorld,
  getEntityState,
  toAbstractSnapshot
};
