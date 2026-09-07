import { rules, zefStates, ZefEntity, ZefState } from './vok/rules';

export interface EntityState {
  id: string;
  state: ZefState;
  timestamp: number;
}

export interface Operation {
  type: string;
  entityId: string;
  fromState: ZefState;
  toState: ZefState;
  timestamp: number;
}

export interface AbstractSnapshot {
  [entityId: string]: ZefState;
}

interface InternalState {
  entities: Map<string, EntityState>;
  operations: Operation[];
}

const internalState: InternalState = {
  entities: new Map(),
  operations: []
};

export const protocol = {
  reset: (): void => {
    internalState.entities.clear();
    internalState.operations = [];
  },

  applyOperation: (operation: Operation): boolean => {
    const entity = internalState.entities.get(operation.entityId);
    
    if (!entity) {
      return false;
    }

    // Validate transition is allowed by rules
    if (!rules.isValidTransition(entity.state, operation.toState)) {
      return false;
    }

    // Update entity state
    entity.state = operation.toState;
    entity.timestamp = operation.timestamp;

    // Record operation
    internalState.operations.push(operation);

    return true;
  },

  getEntityState: (entityId: string): EntityState | undefined => {
    return internalState.entities.get(entityId);
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    const snapshot: AbstractSnapshot = {};
    for (const [id, entity] of internalState.entities) {
      snapshot[id] = entity.state;
    }
    return snapshot;
  },

  // Internal helper methods
  _initializeEntity: (entityId: string, initialState: ZefState): void => {
    internalState.entities.set(entityId, {
      id: entityId,
      state: initialState,
      timestamp: Date.now()
    });
  },

  _createOperation: (entityId: string, fromState: ZefState, toState: ZefState, type: string = 'transition'): Operation => {
    return {
      type,
      entityId,
      fromState,
      toState,
      timestamp: Date.now()
    };
  },

  // Fast track operation: nim -> dor without intermediate pex state
  fastTrackZef: (entityId: string): boolean => {
    const entity = internalState.entities.get(entityId);
    
    if (!entity) {
      return false;
    }

    if (entity.state !== zefStates.nim) {
      return false;
    }

    const operation = protocol._createOperation(
      entityId,
      zefStates.nim,
      zefStates.dor,
      'fastTrackZef'
    );

    return protocol.applyOperation(operation);
  }
};

export type WorldProtocol = typeof protocol;
