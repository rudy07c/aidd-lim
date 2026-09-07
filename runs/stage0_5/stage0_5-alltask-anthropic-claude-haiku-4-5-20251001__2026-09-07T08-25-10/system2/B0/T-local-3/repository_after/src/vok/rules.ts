import { WorldSnapshot, Operation } from '../protocol_adapter';

export function applyResetFenOperation(
  state: WorldSnapshot,
  operation: Operation
): void {
  const entityId = operation.entityId;

  if (!state.entities.has(entityId)) {
    state.entities.set(entityId, { fen: 'nim' });
    return;
  }

  const entity = state.entities.get(entityId);
  if (entity && entity.fen === 'pex') {
    entity.fen = 'nim';
  }
}
