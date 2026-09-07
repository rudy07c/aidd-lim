export interface VokState {
  value: 'nim' | 'pex' | 'dor';
}

export interface ZefState {
  value: 'nim' | 'pex' | 'dor';
}

export type AnyState = VokState | ZefState;

export function advanceVok(state: VokState): VokState {
  if (state.value === 'nim') return { value: 'pex' };
  if (state.value === 'pex') return { value: 'dor' };
  return state;
}

export function advanceZef(state: ZefState): ZefState {
  if (state.value === 'nim') return { value: 'pex' };
  if (state.value === 'pex') return { value: 'dor' };
  return state;
}

export function jumpVokZefToDor(vokState: VokState, zefState: ZefState): { vok: VokState; zef: ZefState } {
  if (vokState.value === 'nim' && zefState.value === 'nim') {
    return {
      vok: { value: 'dor' },
      zef: { value: 'dor' }
    };
  }
  return { vok: vokState, zef: zefState };
}
