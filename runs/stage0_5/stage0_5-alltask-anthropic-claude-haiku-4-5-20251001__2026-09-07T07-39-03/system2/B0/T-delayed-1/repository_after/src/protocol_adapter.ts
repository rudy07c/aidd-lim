import { WorldProtocol } from './protocol';
import { Operation, EntityState } from './types';
import { rules } from './vok/rules';

let world: EntityState = {};

export const protocol: WorldProtocol = {
  reset: (initialState: EntityState = {}) => {
    world = JSON.parse(JSON.stringify(initialState));
  },

  applyOperation: (operation: Operation): EntityState => {
    switch (operation.type) {
      case 'resetZef':
        if (!world.Zef) {
          world.Zef = {};
        }
        world.Zef.state = 'nim';
        break;
      default:
        // Handle other operations if they exist
        break;
    }
    return world;
  },

  getEntityState: (entityId: string): any => {
    return world[entityId] || null;
  },

  toAbstractSnapshot: (): EntityState => {
    return JSON.parse(JSON.stringify(world));
  }
};
