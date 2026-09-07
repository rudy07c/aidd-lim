import { VokState, vokRules, VokOperation } from './vok/rules';
import { WorldProtocol } from './types';

type EntityId = 'vok';
type Entity = VokState;
type Operation = VokOperation;

interface WorldState {
  vok: VokState;
}

class ProtocolImpl implements WorldProtocol {
  private state: WorldState;

  constructor() {
    this.state = {
      vok: vokRules.initialState(),
    };
  }

  reset(): void {
    this.state = {
      vok: vokRules.initialState(),
    };
  }

  applyOperation(operation: Operation): void {
    if (operation.type === 'moveVok' || operation.type === 'fullResetVok') {
      this.state.vok = vokRules.applyOperation(this.state.vok, operation);
    }
  }

  getEntityState(entityId: EntityId): Entity | null {
    if (entityId === 'vok') {
      return this.state.vok;
    }
    return null;
  }

  toAbstractSnapshot(): WorldState {
    return {
      vok: {
        entityId: this.state.vok.entityId,
        state: this.state.vok.state,
      },
    };
  }
}

export const protocol: WorldProtocol = new ProtocolImpl();
