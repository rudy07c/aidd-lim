import { VokState, FenState, vokRules, fenRules } from './vok/rules';

export interface Entity {
  vok: VokState;
  fen: FenState;
}

export interface Operation {
  type: string;
  [key: string]: any;
}

export interface AbstractSnapshot {
  entities: Record<string, Entity>;
  timestamp: number;
}

interface WorldState {
  entities: Record<string, Entity>;
}

let worldState: WorldState = {
  entities: {},
};

export const protocol = {
  reset: () => {
    worldState = {
      entities: {},
    };
  },

  applyOperation: (operation: Operation) => {
    switch (operation.type) {
      case 'initEntity':
        if (!worldState.entities[operation.entityId]) {
          worldState.entities[operation.entityId] = {
            vok: 'nim',
            fen: 'nim',
          };
        }
        break;

      case 'moveVok':
        if (worldState.entities[operation.entityId]) {
          const entity = worldState.entities[operation.entityId];
          if (vokRules.canTransition(entity.vok, operation.to)) {
            entity.vok = operation.to;
          }
        }
        break;

      case 'moveFen':
        if (worldState.entities[operation.entityId]) {
          const entity = worldState.entities[operation.entityId];
          if (fenRules.canTransition(entity.fen, operation.to)) {
            entity.fen = operation.to;
          }
        }
        break;

      case 'jumpVokFen':
        if (worldState.entities[operation.entityId]) {
          const entity = worldState.entities[operation.entityId];
          // Jump Vok from 'nim' to 'dor' directly
          if (entity.vok === 'nim' && vokRules.canTransition('nim', 'dor')) {
            entity.vok = 'dor';
          }
          // Jump Fen from 'nim' to 'dor' directly
          if (entity.fen === 'nim' && fenRules.canTransition('nim', 'dor')) {
            entity.fen = 'dor';
          }
        }
        break;

      default:
        break;
    }
  },

  getEntityState: (entityId: string): Entity | null => {
    return worldState.entities[entityId] ?? null;
  },

  toAbstractSnapshot: (): AbstractSnapshot => {
    return {
      entities: JSON.parse(JSON.stringify(worldState.entities)),
      timestamp: Date.now(),
    };
  },
};
