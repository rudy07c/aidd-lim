import { Operation, EntityState, WorldSnapshot } from './protocol_adapter';

export interface WorldProtocol {
  reset(): void;
  applyOperation(operation: Operation): void;
  getEntityState(entityId: string): EntityState | undefined;
  toAbstractSnapshot(): WorldSnapshot;
}
