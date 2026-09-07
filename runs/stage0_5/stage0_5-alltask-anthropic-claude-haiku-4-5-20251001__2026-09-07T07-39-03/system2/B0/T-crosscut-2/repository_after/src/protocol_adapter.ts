import { vokRules } from './vok/rules';
import { zefRules } from './zef/rules';

interface EntityState {
  state: string;
}

interface VokState extends EntityState {}
interface ZefState extends EntityState {}

interface WorldState {
  vok: VokState;
  zef: ZefState;
}

type OperationType = 'moveVok' | 'moveZef' | 'jumpVokZef';

interface Operation {
  type: OperationType;
  from?: string;
  to?: string;
}

let worldState: WorldState = {
  vok: { state: 'nim' },
  zef: { state: 'nim' },
};

function isValidTransition(
  rules: Record<string, Record<string, () => boolean>>,
  from: string,
  to: string
): boolean {
  if (!(from in rules)) return false;
  if (!(to in rules[from])) return false;
  return rules[from][to]();
}

export const protocol = {
  reset: () => {
    worldState = {
      vok: { state: 'nim' },
      zef: { state: 'nim' },
    };
  },

  applyOperation: (operation: Operation): boolean => {
    switch (operation.type) {
      case 'moveVok': {
        const from = worldState.vok.state;
        const to = operation.to;
        if (!to) return false;
        if (isValidTransition(vokRules, from, to)) {
          worldState.vok.state = to;
          return true;
        }
        return false;
      }

      case 'moveZef': {
        const from = worldState.zef.state;
        const to = operation.to;
        if (!to) return false;
        if (isValidTransition(zefRules, from, to)) {
          worldState.zef.state = to;
          return true;
        }
        return false;
      }

      case 'jumpVokZef': {
        const vokFrom = worldState.vok.state;
        const zefFrom = worldState.zef.state;
        const to = operation.to;
        if (!to) return false;
        
        // Both must be in 'nim' state
        if (vokFrom !== 'nim' || zefFrom !== 'nim') return false;
        
        // Check if both can transition to the target state
        if (
          isValidTransition(vokRules, vokFrom, to) &&
          isValidTransition(zefRules, zefFrom, to)
        ) {
          worldState.vok.state = to;
          worldState.zef.state = to;
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  },

  getEntityState: (entity: 'vok' | 'zef'): string => {
    return worldState[entity].state;
  },

  toAbstractSnapshot: () => {
    return {
      vok: worldState.vok.state,
      zef: worldState.zef.state,
    };
  },
};
