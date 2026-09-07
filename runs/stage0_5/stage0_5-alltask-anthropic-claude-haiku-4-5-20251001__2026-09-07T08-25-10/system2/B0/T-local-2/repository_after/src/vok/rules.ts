import { WorldProtocol, Operation, Entity, EntityState } from '../types';

interface VokState extends EntityState {
  state: 'nim' | 'pex';
}

export const vokRules = {
  resetVok: (entity: Entity<VokState>): Operation => ({
    type: 'setEntityState',
    entity: entity.name,
    state: {
      ...entity.state,
      state: 'nim',
    },
  }),

  transformVok: (entity: Entity<VokState>): Operation => ({
    type: 'setEntityState',
    entity: entity.name,
    state: {
      ...entity.state,
      state: 'pex',
    },
  }),
};
