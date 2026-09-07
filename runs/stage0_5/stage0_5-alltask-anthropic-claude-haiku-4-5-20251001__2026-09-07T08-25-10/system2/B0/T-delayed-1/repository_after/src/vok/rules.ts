import { Operation, EntityState } from './types';

export function applyRules(
  state: Record<string, EntityState>,
  operation: Operation
): Record<string, EntityState> {
  const newState = { ...state };

  if (operation.type === 'resetZef') {
    if (newState['Zef']) {
      newState['Zef'] = { state: 'nim' };
    }
  }

  return newState;
}
