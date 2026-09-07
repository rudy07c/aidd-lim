import { Operation } from '../types';

export const rules = {
  progressFen: {
    from: 'pex',
    to: 'dor',
  } as Operation,
  progressZef: {
    from: 'pex',
    to: 'dor',
  } as Operation,
  lockFenZef: {
    from: 'pex',
    to: 'dor',
    simultaneous: true,
    entities: ['Fen', 'Zef'],
  } as Operation,
};
