import { WorldProtocol } from '../types';

export const rules = {
  moveVok: (protocol: WorldProtocol) => {
    const vokState = protocol.getEntityState('vok');
    if (vokState?.location === 'nim') {
      protocol.applyOperation({
        type: 'moveVok',
        payload: { from: 'nim', to: 'pex' },
      });
    }
  },

  moveFen: (protocol: WorldProtocol) => {
    const fenState = protocol.getEntityState('fen');
    if (fenState?.location === 'nim') {
      protocol.applyOperation({
        type: 'moveFen',
        payload: { from: 'nim', to: 'pex' },
      });
    }
  },

  jumpVokFen: (protocol: WorldProtocol) => {
    const vokState = protocol.getEntityState('vok');
    const fenState = protocol.getEntityState('fen');
    if (vokState?.location === 'nim' && fenState?.location === 'nim') {
      protocol.applyOperation({
        type: 'jumpVokFen',
        payload: { from: 'nim', to: 'dor' },
      });
    }
  },
};
