export type Zef = 'pex' | 'vok' | 'dor';

export const ZefRules = {
  initial: 'pex' as const,
  transitions: {
    pex: ['vok'],
    vok: ['dor'],
    dor: ['pex'],
  },
  canTransition: (from: Zef, to: Zef): boolean => {
    return ZefRules.transitions[from]?.includes(to) ?? false;
  },
} as const;
