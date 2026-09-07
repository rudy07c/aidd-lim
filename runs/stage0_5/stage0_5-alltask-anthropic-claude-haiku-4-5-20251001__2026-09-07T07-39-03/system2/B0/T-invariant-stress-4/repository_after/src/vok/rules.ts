import type { Operation, WorldState, EntityState } from '../types';

export const vokRules = {
  transitions: {
    pex: 'qua',
    qua: 'dor',
  } as Record<string, string>,
};

export const zefRules = {
  transitions: {
    pex: 'qua',
    qua: 'dor',
  } as Record<string, string>,
};

export const turboVokZefTransition = {
  vok: { from: 'pex', to: 'dor' },
  zef: { from: 'pex', to: 'dor' },
} as const;
