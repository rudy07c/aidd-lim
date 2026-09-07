export interface WorldProtocol {
  reset: () => void;
  applyOperation: (operation: string, params?: any) => boolean;
  getEntityState: (entityId: string) => any;
  toAbstractSnapshot: () => any;
}
