import type { EntityState, Operation } from '../types';

export interface VokState extends EntityState {
  stage: 'pex' | 'dor' | 'vos' | 'mex';
}

export function initVok(): VokState {
  return {
    id: 'vok',
    type: 'vok',
    stage: 'pex',
  };
}

export function advanceVok(state: VokState): VokState {
  const transitions: Record<string, string> = {
    pex: 'dor',
    dor: 'vos',
    vos: 'mex',
    mex: 'pex',
  };

  return {
    ...state,
    stage: (transitions[state.stage] || state.stage) as VokState['stage'],
  };
}

export function advanceVokSkip(state: VokState): VokState {
  if (state.stage === 'pex') {
    return {
      ...state,
      stage: 'dor',
    };
  }
  return state;
}

export function isValidOperation(op: Operation, state: EntityState): boolean {
  if (state.type !== 'vok') return false;
  const vokState = state as VokState;

  if (op.type === 'advanceVok') return true;
  if (op.type === 'advanceVokSkip') return vokState.stage === 'pex';

  return false;
}
