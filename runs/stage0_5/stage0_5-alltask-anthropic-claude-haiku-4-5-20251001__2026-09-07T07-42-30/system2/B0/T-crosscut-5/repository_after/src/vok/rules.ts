export interface Entity {
  position: string;
}

export interface World {
  tal: Entity;
  fen: Entity;
}

export type Operation = 
  | { type: 'moveTal'; from: string; to: string }
  | { type: 'moveFen'; from: string; to: string }
  | { type: 'boostTalFen'; from: string; to: string };

export function applyOperation(world: World, op: Operation): World {
  switch (op.type) {
    case 'moveTal':
      if (world.tal.position === op.from) {
        return {
          ...world,
          tal: { position: op.to }
        };
      }
      return world;
    
    case 'moveFen':
      if (world.fen.position === op.from) {
        return {
          ...world,
          fen: { position: op.to }
        };
      }
      return world;
    
    case 'boostTalFen':
      if (world.tal.position === op.from && world.fen.position === op.from) {
        return {
          ...world,
          tal: { position: op.to },
          fen: { position: op.to }
        };
      }
      return world;
    
    default:
      const _exhaustive: never = op;
      return _exhaustive;
  }
}
