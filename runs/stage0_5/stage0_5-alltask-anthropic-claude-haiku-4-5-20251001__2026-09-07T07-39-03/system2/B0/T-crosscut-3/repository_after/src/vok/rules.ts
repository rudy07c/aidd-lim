export const rules = {
  reset: (state: any) => {
    return {
      entities: {},
      ...state
    };
  },

  applyOperation: (state: any, operation: any) => {
    return state;
  },

  advanceOskFen: (state: any, payload: any) => {
    // Osk と Fen を同時に 'nim' から 'pex' へ進める
    const newState = JSON.parse(JSON.stringify(state));
    
    if (newState.entities) {
      // Osk を進める
      if (newState.entities.Osk) {
        if (newState.entities.Osk.position === 'nim') {
          newState.entities.Osk.position = 'pex';
        }
      }
      
      // Fen を進める
      if (newState.entities.Fen) {
        if (newState.entities.Fen.position === 'nim') {
          newState.entities.Fen.position = 'pex';
        }
      }
    }
    
    return newState;
  },

  getEntityState: (state: any, entityId: string) => {
    return state.entities?.[entityId] || null;
  },

  toAbstractSnapshot: (state: any) => {
    return {
      entities: state.entities || {},
      timestamp: Date.now()
    };
  }
};
