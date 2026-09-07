export type OperationType = 'advanceVok' | 'forceAdvanceVok' | 'resetVok';

export interface Operation {
  type: OperationType;
  entityId?: string;
  [key: string]: any;
}
