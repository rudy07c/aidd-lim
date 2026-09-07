import { WorldProtocol, EntityState } from './protocol.js';

interface Operation {
  execute(state: { fen: string; entities: Map<string, EntityState> }, params?: Record<string, unknown>): void;
}

interface RulesDefinition {
  operations: Record<string, Operation>;
}

export const rules: RulesDefinition = {
  operations: {
    resetFen: {
      execute(state) {
        state.fen = 'nim';
      },
    },
  },
};
