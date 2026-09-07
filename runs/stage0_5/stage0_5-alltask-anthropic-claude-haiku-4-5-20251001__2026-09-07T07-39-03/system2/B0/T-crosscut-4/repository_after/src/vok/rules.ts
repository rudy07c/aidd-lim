import type { Entity, EntityState, Operation } from '../types';

const VALID_STATES = {
  Fen: ['pex', 'dor'],
  Zef: ['pex', 'dor'],
};

const VALID_OPERATIONS = [
  'moveFen',
  'moveZef',
  'lockFenZef',
] as const;

export type OperationType = typeof VALID_OPERATIONS[number];

export interface Rule {
  type: OperationType;
  apply: (entity: Entity) => Entity;
  validate: (entity: Entity) => boolean;
}

const rules: Record<OperationType, Rule> = {
  moveFen: {
    type: 'moveFen',
    validate: (entity: Entity) => {
      return entity.Fen !== undefined && entity.Fen !== 'dor';
    },
    apply: (entity: Entity) => {
      return {
        ...entity,
        Fen: 'dor',
      };
    },
  },
  moveZef: {
    type: 'moveZef',
    validate: (entity: Entity) => {
      return entity.Zef !== undefined && entity.Zef !== 'dor';
    },
    apply: (entity: Entity) => {
      return {
        ...entity,
        Zef: 'dor',
      };
    },
  },
  lockFenZef: {
    type: 'lockFenZef',
    validate: (entity: Entity) => {
      return (
        entity.Fen !== undefined &&
        entity.Fen !== 'dor' &&
        entity.Zef !== undefined &&
        entity.Zef !== 'dor'
      );
    },
    apply: (entity: Entity) => {
      return {
        ...entity,
        Fen: 'dor',
        Zef: 'dor',
      };
    },
  },
};

export function validateState(entity: Entity): boolean {
  for (const [key, value] of Object.entries(entity)) {
    if (key in VALID_STATES) {
      const validStates = VALID_STATES[key as keyof typeof VALID_STATES];
      if (!validStates.includes(value)) {
        return false;
      }
    }
  }
  return true;
}

export function applyRule(
  entity: Entity,
  operationType: OperationType
): Entity {
  const rule = rules[operationType];
  if (!rule.validate(entity)) {
    throw new Error(
      `Invalid operation: ${operationType} cannot be applied to current entity state`
    );
  }
  return rule.apply(entity);
}

export function isValidOperation(op: unknown): op is OperationType {
  return typeof op === 'string' && VALID_OPERATIONS.includes(op as OperationType);
}
