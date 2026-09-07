import type { Entity, Operation, OperationResult } from '../types';

/**
 * Vok rules - defines valid state transitions and operations for Vok entity
 */

export interface VokState extends Entity {
  name: 'Vok';
  phase: 'pex' | 'dor' | 'mex';
}

export interface ZefState extends Entity {
  name: 'Zef';
  phase: 'pex' | 'dor' | 'mex';
}

export interface TurboVokZefOperation extends Operation {
  type: 'turboVokZef';
}

/**
 * Advances Vok from 'pex' to 'dor'
 */
export function advanceVokPexToDor(vok: VokState): OperationResult<VokState> {
  if (vok.phase !== 'pex') {
    return {
      success: false,
      error: `Vok must be in 'pex' phase to advance to 'dor', currently in '${vok.phase}'`,
    };
  }

  return {
    success: true,
    result: {
      ...vok,
      phase: 'dor',
    },
  };
}

/**
 * Advances Zef from 'pex' to 'dor'
 */
export function advanceZefPexToDor(zef: ZefState): OperationResult<ZefState> {
  if (zef.phase !== 'pex') {
    return {
      success: false,
      error: `Zef must be in 'pex' phase to advance to 'dor', currently in '${zef.phase}'`,
    };
  }

  return {
    success: true,
    result: {
      ...zef,
      phase: 'dor',
    },
  };
}

/**
 * TurboVokZef operation - advances both Vok and Zef from 'pex' to 'dor' simultaneously
 * for performance optimization
 */
export function turboVokZef(
  vok: VokState,
  zef: ZefState
): OperationResult<{ vok: VokState; zef: ZefState }> {
  // Validate Vok state
  if (vok.phase !== 'pex') {
    return {
      success: false,
      error: `Vok must be in 'pex' phase, currently in '${vok.phase}'`,
    };
  }

  // Validate Zef state
  if (zef.phase !== 'pex') {
    return {
      success: false,
      error: `Zef must be in 'pex' phase, currently in '${zef.phase}'`,
    };
  }

  // Advance both simultaneously
  return {
    success: true,
    result: {
      vok: {
        ...vok,
        phase: 'dor',
      },
      zef: {
        ...zef,
        phase: 'dor',
      },
    },
  };
}
