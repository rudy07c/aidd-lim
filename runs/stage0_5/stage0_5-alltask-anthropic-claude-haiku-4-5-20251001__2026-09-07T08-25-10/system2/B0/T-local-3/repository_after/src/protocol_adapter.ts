import { WorldProtocol } from './types';
import { applyResetFenOperation } from './vok/rules';

export interface Operation {
  type: string;
  [key: string]: any;
}

export interface EntityState {
  fen: string;
  [key: string]: any;
}

export interface WorldSnapshot {
  entities: Map<string, EntityState>;
  [key: string]: any;
}

class ProtocolImpl implements WorldProtocol {
  private state: WorldSnapshot = {
    entities: new Map(),
  };

  reset(): void {
    this.state = {
      entities: new Map(),
    };
  }

  applyOperation(operation: Operation): void {
    if (operation.type === 'resetFen') {
      applyResetFenOperation(this.state, operation);
    }
  }

  getEntityState(entityId: string): EntityState | undefined {
    return this.state.entities.get(entityId);
  }

  toAbstractSnapshot(): WorldSnapshot {
    return {
      entities: new Map(this.state.entities),
    };
  }
}

export const protocol: WorldProtocol = new ProtocolImpl();
