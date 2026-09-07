// Rules for the world protocol

export interface Entity {
  id: string;
  state: string;
}

export interface Operation {
  type: string;
  targetId?: string;
  [key: string]: any;
}

export interface WorldState {
  entities: Map<string, Entity>;
}

// Entity state transitions
export const ENTITY_TRANSITIONS: Record<string, string[]> = {
  nim: ['pex', 'dor'],
  pex: ['dor'],
  dor: [],
};

// Special operations that bypass normal transitions
export const SPECIAL_OPERATIONS: Record<string, (state: WorldState, op: Operation) => boolean> = {
  rushZefFen: (state: WorldState, op: Operation): boolean => {
    // Check if both Zef and Fen exist and are in 'nim' state
    const zefEntity = state.entities.get('Zef');
    const fenEntity = state.entities.get('Fen');
    
    if (!zefEntity || !fenEntity) {
      return false;
    }
    
    if (zefEntity.state !== 'nim' || fenEntity.state !== 'nim') {
      return false;
    }
    
    // Move both to 'dor' state directly
    zefEntity.state = 'dor';
    fenEntity.state = 'dor';
    
    return true;
  },
};

// Standard operation: moveEntity
export function canMoveEntity(state: WorldState, entityId: string, targetState: string): boolean {
  const entity = state.entities.get(entityId);
  
  if (!entity) {
    return false;
  }
  
  const currentTransitions = ENTITY_TRANSITIONS[entity.state];
  return currentTransitions && currentTransitions.includes(targetState);
}

export function moveEntity(state: WorldState, entityId: string, targetState: string): boolean {
  if (!canMoveEntity(state, entityId, targetState)) {
    return false;
  }
  
  const entity = state.entities.get(entityId);
  if (entity) {
    entity.state = targetState;
    return true;
  }
  
  return false;
}
