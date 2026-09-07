export type VokState = 'nim' | 'pex' | 'dor';
export type FenState = 'nim' | 'pex' | 'dor';

export interface VokRules {
  canTransition: (from: VokState, to: VokState) => boolean;
  isValidState: (state: VokState) => boolean;
}

export interface FenRules {
  canTransition: (from: FenState, to: FenState) => boolean;
  isValidState: (state: FenState) => boolean;
}

export const vokRules: VokRules = {
  canTransition: (from: VokState, to: VokState) => {
    const validTransitions: Record<VokState, VokState[]> = {
      nim: ['pex', 'dor'],
      pex: ['dor'],
      dor: [],
    };
    return validTransitions[from]?.includes(to) ?? false;
  },
  isValidState: (state: VokState) => {
    return ['nim', 'pex', 'dor'].includes(state);
  },
};

export const fenRules: FenRules = {
  canTransition: (from: FenState, to: FenState) => {
    const validTransitions: Record<FenState, FenState[]> = {
      nim: ['pex', 'dor'],
      pex: ['dor'],
      dor: [],
    };
    return validTransitions[from]?.includes(to) ?? false;
  },
  isValidState: (state: FenState) => {
    return ['nim', 'pex', 'dor'].includes(state);
  },
};
