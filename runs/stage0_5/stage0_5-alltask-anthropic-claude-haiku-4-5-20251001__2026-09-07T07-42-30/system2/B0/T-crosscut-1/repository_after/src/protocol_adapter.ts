import { WorldProtocol, Entity, Operation } from './vok/schema';
import { kindleOne, kindleBoth } from './vok/rules';

interface WorldState {
  entities: Entity[];
  history: Operation[];
}

let state: WorldState = {
  entities: [
    { name: 'Zef', state: 'dormant' },
    { name: 'Tal', state: 'dormant' }
  ],
  history: []
};

const reset = (): void => {
  state = {
    entities: [
      { name: 'Zef', state: 'dormant' },
      { name: 'Tal', state: 'dormant' }
    ],
    history: []
  };
};

const applyOperation = (op: Operation): void => {
  switch (op.type) {
    case 'kindleOne': {
      const entityIndex = state.entities.findIndex(e => e.name === op.target);
      if (entityIndex !== -1) {
        state.entities[entityIndex] = kindleOne(state.entities[entityIndex]);
      }
      break;
    }
    case 'kindleBoth': {
      const zefIndex = state.entities.findIndex(e => e.name === 'Zef');
      const talIndex = state.entities.findIndex(e => e.name === 'Tal');
      if (zefIndex !== -1 && talIndex !== -1) {
        const [kindledZef, kindledTal] = kindleBoth(state.entities[zefIndex], state.entities[talIndex]);
        state.entities[zefIndex] = kindledZef;
        state.entities[talIndex] = kindledTal;
      }
      break;
    }
  }
  state.history.push(op);
};

const getEntityState = (name: string): string | null => {
  const entity = state.entities.find(e => e.name === name);
  return entity ? entity.state : null;
};

const toAbstractSnapshot = (): object => {
  return {
    entities: state.entities.map(e => ({ name: e.name, state: e.state })),
    operationCount: state.history.length
  };
};

export const protocol: WorldProtocol = {
  reset,
  applyOperation,
  getEntityState,
  toAbstractSnapshot
};
