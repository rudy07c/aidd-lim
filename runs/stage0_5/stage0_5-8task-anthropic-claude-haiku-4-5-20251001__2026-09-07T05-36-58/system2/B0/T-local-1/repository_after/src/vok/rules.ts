import { Operation } from '../types';

export type VokState = 'nim' | 'dor' | 'intermediate';

export interface VokEntity {
  id: string;
  state: VokState;
}

export const initialVokState: VokState = 'nim';

export function applyVokOperation(
  entity: VokEntity,
  operation: Operation
): VokEntity {
  switch (operation.type) {
    case 'advanceVok':
      // Normal progression: nim -> intermediate -> dor
      if (entity.state === 'nim') {
        return { ...entity, state: 'intermediate' };
      }
      if (entity.state === 'intermediate') {
        return { ...entity, state: 'dor' };
      }
      return entity;

    case 'forceAdvanceVok':
      // Force progression: nim -> dor (single step)
      if (entity.state === 'nim') {
        return { ...entity, state: 'dor' };
      }
      // If already at dor or intermediate, no change
      return entity;

    case 'resetVok':
      return { ...entity, state: 'nim' };

    default:
      return entity;
  }
}
