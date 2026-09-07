import { GameState, WorldProtocol } from '../types';
import { vokRules } from './rules';

export interface VokRules {
  resetFen(): Partial<GameState>;
  applyFenOperation(state: GameState, operation: string, data: any): Partial<GameState>;
}

export const vokRules: VokRules = {
  resetFen(): Partial<GameState> {
    return {
      fen: 'nim'
    };
  },
  
  applyFenOperation(state: GameState, operation: string, data: any): Partial<GameState> {
    if (operation === 'resetFen') {
      return this.resetFen();
    }
    return {};
  }
};
