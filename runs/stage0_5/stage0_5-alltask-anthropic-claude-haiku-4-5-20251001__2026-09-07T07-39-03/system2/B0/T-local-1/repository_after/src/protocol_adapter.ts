import { WorldProtocol } from './types';
import * as rules from './vok/rules';

export const protocol: WorldProtocol = {
  reset(): void {
    rules.resetVok();
  },

  applyOperation(operation: string): void {
    switch (operation) {
      case 'advanceVok':
        rules.advanceVok();
        break;
      case 'forceAdvanceVok':
        rules.forceAdvanceVok();
        break;
      case 'resetVok':
        rules.resetVok();
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  },

  getEntityState(entity: string): string {
    if (entity === 'vok') {
      return rules.getVokState();
    }
    throw new Error(`Unknown entity: ${entity}`);
  },

  toAbstractSnapshot(): Record<string, string> {
    return {
      vok: rules.getVokState(),
    };
  },
};
