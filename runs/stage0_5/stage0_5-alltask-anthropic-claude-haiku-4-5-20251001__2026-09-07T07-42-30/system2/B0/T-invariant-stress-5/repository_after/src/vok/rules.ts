import { WorldProtocol, Operation, OperationResult, OperationContext } from '../types';
import { createEntityState, mergeEntityState } from '../entity_state';

export interface VokEntity {
  id: string;
  state: 'pex' | 'vor' | 'dor' | 'ter';
  energy: number;
}

export const vokRules = {
  createInitialState(): VokEntity {
    return {
      id: 'vok',
      state: 'pex',
      energy: 100
    };
  },

  validateAdvance(entity: VokEntity): boolean {
    return entity.state === 'pex' && entity.energy >= 10;
  },

  validateAdvanceSkip(entity: VokEntity): boolean {
    return entity.state === 'pex' && entity.energy >= 20;
  },

  advance(entity: VokEntity): VokEntity {
    if (!this.validateAdvance(entity)) {
      throw new Error('Cannot advance: invalid state or insufficient energy');
    }
    return {
      ...entity,
      state: 'vor',
      energy: entity.energy - 10
    };
  },

  advanceSkip(entity: VokEntity): VokEntity {
    if (!this.validateAdvanceSkip(entity)) {
      throw new Error('Cannot advance skip: invalid state or insufficient energy');
    }
    return {
      ...entity,
      state: 'dor',
      energy: entity.energy - 20
    };
  }
};
