export interface VokState {
  state: 'nim' | 'pex';
}

export interface VokOperation {
  type: 'resetVok';
}

export function applyVokOperation(
  vokState: VokState,
  operation: VokOperation
): VokState {
  if (operation.type === 'resetVok') {
    return { state: 'nim' };
  }
  return vokState;
}

export function getInitialVokState(): VokState {
  return { state: 'nim' };
}
