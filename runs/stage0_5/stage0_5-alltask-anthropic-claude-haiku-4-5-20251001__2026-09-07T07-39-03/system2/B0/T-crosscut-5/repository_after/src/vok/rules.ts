import type { Operation, EntityState, WorldSnapshot } from './types';

export const rules: Record<string, Operation> = {
  reset: {
    name: 'reset',
    apply: (_state: WorldSnapshot): WorldSnapshot => ({
      entities: {
        Tal: { stage: 'nim' },
        Fen: { stage: 'nim' },
      },
    }),
  },
  advanceTal: {
    name: 'advanceTal',
    apply: (state: WorldSnapshot): WorldSnapshot => ({
      entities: {
        ...state.entities,
        Tal: { stage: state.entities.Tal.stage === 'nim' ? 'pex' : state.entities.Tal.stage },
      },
    }),
  },
  advanceFen: {
    name: 'advanceFen',
    apply: (state: WorldSnapshot): WorldSnapshot => ({
      entities: {
        ...state.entities,
        Fen: { stage: state.entities.Fen.stage === 'nim' ? 'pex' : state.entities.Fen.stage },
      },
    }),
  },
  boostTalFen: {
    name: 'boostTalFen',
    apply: (state: WorldSnapshot): WorldSnapshot => ({
      entities: {
        Tal: { stage: state.entities.Tal.stage === 'nim' ? 'pex' : state.entities.Tal.stage },
        Fen: { stage: state.entities.Fen.stage === 'nim' ? 'pex' : state.entities.Fen.stage },
      },
    }),
  },
};
