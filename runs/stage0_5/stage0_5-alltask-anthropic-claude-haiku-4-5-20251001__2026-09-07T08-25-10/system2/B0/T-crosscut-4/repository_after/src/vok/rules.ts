import { Operation, WorldState } from './types';

export const rules = {
  moveToNext: (state: WorldState, entityName: string): WorldState => {
    const positions = { ...state.positions };
    const currentPos = positions[entityName];

    if (currentPos === 'pex') {
      positions[entityName] = 'dor';
    } else if (currentPos === 'dor') {
      positions[entityName] = 'cra';
    }

    return { ...state, positions };
  },

  lockFenZef: (state: WorldState): WorldState => {
    const positions = { ...state.positions };

    // Move both Fen and Zef from 'pex' to 'dor' simultaneously
    if (positions['Fen'] === 'pex') {
      positions['Fen'] = 'dor';
    }
    if (positions['Zef'] === 'pex') {
      positions['Zef'] = 'dor';
    }

    return { ...state, positions };
  },
};

export const operationHandlers: Record<string, (state: WorldState, params?: any) => WorldState> = {
  moveToNext: (state: WorldState, params: any) =>
    rules.moveToNext(state, params?.entityName),
  lockFenZef: (state: WorldState) => rules.lockFenZef(state),
};
