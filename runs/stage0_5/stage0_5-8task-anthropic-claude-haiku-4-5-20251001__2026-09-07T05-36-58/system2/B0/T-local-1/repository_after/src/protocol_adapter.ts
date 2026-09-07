import { Operation } from './types';
import { VokEntity, VokState, initialVokState, applyVokOperation } from './vok/rules';

export interface EntityState {
  [key: string]: any;
}

export interface AbstractSnapshot {
  entities: { [id: string]: EntityState };
  timestamp?: number;
}

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): void;
  getEntityState(entityId: string): EntityState | null;
  toAbstractSnapshot(): AbstractSnapshot;
}

class WorldProtocolImpl implements WorldProtocol {
  private entities: Map<string, VokEntity> = new Map();
  private operationHistory: Operation[] = [];

  reset(): void {
    this.entities.clear();
    this.operationHistory = [];
  }

  applyOperation(operation: Operation): void {
    // Initialize entity if not exists
    if (operation.entityId && !this.entities.has(operation.entityId)) {
      this.entities.set(operation.entityId, {
        id: operation.entityId,
        state: initialVokState,
      });
    }

    // Apply operation to the entity
    if (operation.entityId) {
      const entity = this.entities.get(operation.entityId);
      if (entity) {
        const updated = applyVokOperation(entity, operation);
        this.entities.set(operation.entityId, updated);
      }
    }

    // Record operation
    this.operationHistory.push(operation);
  }

  getEntityState(entityId: string): EntityState | null {
    const entity = this.entities.get(entityId);
    if (!entity) {
      return null;
    }
    return {
      id: entity.id,
      state: entity.state,
    };
  }

  toAbstractSnapshot(): AbstractSnapshot {
    const entities: { [id: string]: EntityState } = {};
    this.entities.forEach((entity, id) => {
      entities[id] = {
        id: entity.id,
        state: entity.state,
      };
    });
    return {
      entities,
      timestamp: Date.now(),
    };
  }
}

export const protocol: WorldProtocol = new WorldProtocolImpl();
