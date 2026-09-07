import { WorldProtocol } from './types';
import { vokRules, VokState } from './vok/rules';

export const protocol: WorldProtocol<VokState> = vokRules;
