import { EntityState, Operation, OperationResult } from '../types';

export interface VokState extends EntityState {
  name: 'vok';
  state: 'initial' | 'nim' | 'dor' | 'final';
}

export function isVokState(state: EntityState): state is VokState {
  return state.name === 'vok';
}

export function advanceVok(vokState: VokState): VokState {
  const stateProgression: Record<string, string> = {
    'initial': 'nim',
    'nim': 'dor',
    'dor': 'final',
    'final': 'final'
  };

  return {
    ...vokState,
    state: stateProgression[vokState.state] as VokState['state']
  };
}

export function forceAdvanceVokToDor(vokState: VokState): VokState {
  if (vokState.state === 'nim') {
    return {
      ...vokState,
      state: 'dor'
    };
  }
  return vokState;
}

export function applyVokOperation(vokState: VokState, operation: Operation): VokState {
  switch (operation.type) {
    case 'advanceVok':
      return advanceVok(vokState);
    case 'forceAdvanceVok':
      return forceAdvanceVokToDor(vokState);
    default:
      return vokState;
  }
}
