export interface VokState {
  name: string;
  description: string;
}

export interface VokAction {
  name: string;
  from: string;
  to: string;
  description: string;
}

export interface VokEntity {
  id: string;
  state: string;
  createdAt: number;
  updatedAt: number;
}
