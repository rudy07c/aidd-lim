import { VokState, ZefState, advanceVok, advanceZef, jumpVokZefToDor } from './vok/rules';

export interface Entity {
  vok?: VokState;
  zef?: ZefState;
}

export interface Snapshot {
  [entityId: string]: Entity;
}

export type Operation =
  | { type: 'advanceVok'; entityId: string }
  | { type: 'advanceZef'; entityId: string }
  | { type: 'jumpVokZef'; entityId: string };

export interface WorldProtocol {
  reset(snapshot: Snapshot): void;
  applyOperation(operation: Operation): void;
  getEntityState(entityId: string): Entity | undefined;
  toAbstractSnapshot(): Snapshot;
}

let currentSnapshot: Snapshot = {};

export const protocol: WorldProtocol = {
  reset(snapshot: Snapshot): void {
    currentSnapshot = JSON.parse(JSON.stringify(snapshot));
  },

  applyOperation(operation: Operation): void {
    const entity = currentSnapshot[operation.entityId];
    if (!entity) return;

    if (operation.type === 'advanceVok' && entity.vok) {
      entity.vok = advanceVok(entity.vok);
    } else if (operation.type === 'advanceZef' && entity.zef) {
      entity.zef = advanceZef(entity.zef);
    } else if (operation.type === 'jumpVokZef') {
      if (entity.vok && entity.zef) {
        const result = jumpVokZefToDor(entity.vok, entity.zef);
        entity.vok = result.vok;
        entity.zef = result.zef;
      }
    }
  },

  getEntityState(entityId: string): Entity | undefined {
    return currentSnapshot[entityId];
  },

  toAbstractSnapshot(): Snapshot {
    return JSON.parse(JSON.stringify(currentSnapshot));
  }
};
