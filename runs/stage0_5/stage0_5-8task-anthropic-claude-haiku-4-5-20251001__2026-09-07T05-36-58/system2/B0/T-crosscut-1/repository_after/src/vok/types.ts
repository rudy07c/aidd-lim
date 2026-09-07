export interface Entity {
  name: string;
  state: string;
}

export interface WorldState {
  entities: {
    [key: string]: Entity;
  };
}

export type OperationType = 'reset' | 'kindle' | 'kindleBoth';

export interface Operation {
  type: OperationType;
  entity?: string;
}
