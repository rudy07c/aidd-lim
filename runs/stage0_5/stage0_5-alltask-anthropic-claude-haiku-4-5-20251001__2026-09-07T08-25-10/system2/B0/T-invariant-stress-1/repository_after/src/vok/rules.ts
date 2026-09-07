import { WorldProtocol, Operation, EntityState } from '../protocol_adapter';

export const zefStates = {
  nim: 'nim',
  pex: 'pex',
  dor: 'dor'
} as const;

export type ZefState = typeof zefStates[keyof typeof zefStates];

export interface ZefEntity {
  id: string;
  state: ZefState;
}

export const rules = {
  normalTransition: (from: ZefState, to: ZefState): boolean => {
    const transitions: Record<ZefState, ZefState[]> = {
      nim: ['pex'],
      pex: ['dor'],
      dor: []
    };
    return transitions[from]?.includes(to) ?? false;
  },

  fastTrackTransition: (from: ZefState, to: ZefState): boolean => {
    // fastTrack allows nim -> dor directly
    return from === 'nim' && to === 'dor';
  },

  isValidTransition: (from: ZefState, to: ZefState): boolean => {
    return rules.normalTransition(from, to) || rules.fastTrackTransition(from, to);
  }
};
