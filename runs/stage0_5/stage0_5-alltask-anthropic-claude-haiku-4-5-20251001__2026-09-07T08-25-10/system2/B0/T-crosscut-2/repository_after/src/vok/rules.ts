export const VOK_STATES = ['nim', 'pex', 'dor'] as const;
export type VokState = typeof VOK_STATES[number];

export const ZEF_STATES = ['nim', 'pex', 'dor'] as const;
export type ZefState = typeof ZEF_STATES[number];

export const VALID_VOK_TRANSITIONS: Record<VokState, VokState[]> = {
  'nim': ['pex', 'dor'],
  'pex': ['dor'],
  'dor': []
};

export const VALID_ZEF_TRANSITIONS: Record<ZefState, ZefState[]> = {
  'nim': ['pex', 'dor'],
  'pex': ['dor'],
  'dor': []
};

export function isValidVokTransition(from: VokState, to: VokState): boolean {
  return VALID_VOK_TRANSITIONS[from].includes(to);
}

export function isValidZefTransition(from: ZefState, to: ZefState): boolean {
  return VALID_ZEF_TRANSITIONS[from].includes(to);
}