import { Operation, WorldState, Entity } from '../types';

export const advanceTalOsk: Operation = {
  name: 'advanceTalOsk',
  validate: (state: WorldState) => {
    const tal = state.entities.find((e: Entity) => e.name === 'Tal');
    const osk = state.entities.find((e: Entity) => e.name === 'Osk');
    
    if (!tal || !osk) {
      return { valid: false, reason: 'Tal or Osk not found' };
    }
    
    if (tal.location !== 'nim' || osk.location !== 'nim') {
      return { valid: false, reason: 'Both Tal and Osk must be at nim' };
    }
    
    return { valid: true };
  },
  apply: (state: WorldState): WorldState => {
    const newEntities = state.entities.map((e: Entity) => {
      if (e.name === 'Tal' && e.location === 'nim') {
        return { ...e, location: 'pex' };
      }
      if (e.name === 'Osk' && e.location === 'nim') {
        return { ...e, location: 'pex' };
      }
      return e;
    });
    
    return {
      ...state,
      entities: newEntities
    };
  }
};
