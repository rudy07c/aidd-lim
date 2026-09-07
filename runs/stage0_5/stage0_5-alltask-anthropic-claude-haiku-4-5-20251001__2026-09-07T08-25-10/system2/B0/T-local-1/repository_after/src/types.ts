export interface EntityState {
  name: string;
  [key: string]: any;
}

export interface Operation {
  type: 'advanceVok' | 'forceAdvanceVok' | string;
  targetEntity?: string;
  [key: string]: any;
}

export interface OperationResult {
  success: boolean;
  message: string;
}

export interface AbstractSnapshot {
  timestamp: number;
  entities: Array<{
    name: string;
    state: string;
  }>;
}
