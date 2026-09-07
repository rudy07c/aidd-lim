import type { Operation, Entity } from '../types';

export const rules: Record<string, Operation> = {
  setPex: {
    name: 'setPex',
    action: (entity: Entity) => {
      entity.state = 'pex';
    },
  },
  resetFen: {
    name: 'resetFen',
    action: (entity: Entity) => {
      if (entity.state === 'pex') {
        entity.state = 'nim';
      }
    },
  },
};
