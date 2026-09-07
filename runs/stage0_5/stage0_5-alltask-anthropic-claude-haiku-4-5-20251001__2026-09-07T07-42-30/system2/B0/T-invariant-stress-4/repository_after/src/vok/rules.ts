import { AbstractSnapshot } from '../types';

export function applyRules(state: { vok: string; zef: string }): AbstractSnapshot {
  return {
    vok: state.vok,
    zef: state.zef,
  };
}
