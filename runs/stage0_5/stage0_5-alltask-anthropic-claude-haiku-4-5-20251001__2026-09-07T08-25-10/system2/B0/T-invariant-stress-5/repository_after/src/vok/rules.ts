import { VokState, VokAction } from './types';

export const VokStates: Record<string, VokState> = {
  egg: { name: 'egg', description: 'Vok egg state' },
  pex: { name: 'pex', description: 'Vok pex state' },
  dor: { name: 'dor', description: 'Vok dor state' },
  vul: { name: 'vul', description: 'Vok vul state' },
};

export const VokActions: Record<string, VokAction> = {
  advanceEgg: {
    name: 'advanceEgg',
    from: 'egg',
    to: 'pex',
    description: 'Progress from egg to pex state',
  },
  advancePex: {
    name: 'advancePex',
    from: 'pex',
    to: 'vul',
    description: 'Progress from pex to vul state',
  },
  advanceVokSkip: {
    name: 'advanceVokSkip',
    from: 'pex',
    to: 'dor',
    description: 'Fast skip progression from pex directly to dor state',
  },
  advanceVul: {
    name: 'advanceVul',
    from: 'vul',
    to: 'dor',
    description: 'Progress from vul to dor state',
  },
};

export function isValidTransition(fromState: string, action: string): boolean {
  const vokAction = VokActions[action];
  if (!vokAction) return false;
  return vokAction.from === fromState;
}

export function getNextState(fromState: string, action: string): string | null {
  const vokAction = VokActions[action];
  if (!vokAction || vokAction.from !== fromState) return null;
  return vokAction.to;
}
