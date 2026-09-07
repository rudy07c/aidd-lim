import { WorldState } from "../world";

/**
 * Advance Zef from nim to pex
 */
export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error(`advanceZef1: expected zef to be 'nim', got '${world.zef}'`);
  }
  return { ...world, zef: "pex" };
}

/**
 * Advance Zef from pex to dor
 */
export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error(`advanceZef2: expected zef to be 'pex', got '${world.zef}'`);
  }
  return { ...world, zef: "dor" };
}

/**
 * Recover Zef from dor back to pex
 */
export function recoverZef(world: WorldState): WorldState {
  if (world.zef !== "dor") {
    throw new Error(`recoverZef: expected zef to be 'dor', got '${world.zef}'`);
  }
  return { ...world, zef: "pex" };
}
