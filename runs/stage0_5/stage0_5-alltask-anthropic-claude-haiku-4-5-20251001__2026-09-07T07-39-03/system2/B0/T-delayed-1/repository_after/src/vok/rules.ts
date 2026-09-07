export const rules = {
  operations: [
    {
      name: 'resetZef',
      description: 'Reset Zef from pex state back to nim state',
      execute: (world: any) => {
        if (world.Zef) {
          world.Zef.state = 'nim';
        }
        return world;
      }
    }
  ]
};
