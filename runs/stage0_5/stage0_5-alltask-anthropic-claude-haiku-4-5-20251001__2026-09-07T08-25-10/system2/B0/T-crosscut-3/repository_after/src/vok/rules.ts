// Game rules for Osk and Fen movement

export interface GameState {
  osk: { position: string };
  fen: { position: string };
}

export type Operation =
  | { type: 'reset' }
  | { type: 'advanceOsk'; target: string }
  | { type: 'advanceFen'; target: string }
  | { type: 'advanceOskFen'; target: string };

export const rules = {
  reset(): GameState {
    return {
      osk: { position: 'nim' },
      fen: { position: 'nim' }
    };
  },

  applyOperation(state: GameState, operation: Operation): GameState {
    switch (operation.type) {
      case 'reset':
        return this.reset();
      case 'advanceOsk':
        return {
          ...state,
          osk: { position: operation.target }
        };
      case 'advanceFen':
        return {
          ...state,
          fen: { position: operation.target }
        };
      case 'advanceOskFen':
        return {
          ...state,
          osk: { position: operation.target },
          fen: { position: operation.target }
        };
      default:
        return state;
    }
  }
};
