import { WorldState } from "../world";

/**
 * lockFenZef: Fen and Zef: pex -> dor simultaneously
 * Combines advanceFen2 and advanceZef2 in a single operation.
 * Requires: Fen='pex', Zef='pex', Osk='pex', Tal='pex'
 */
export function lockFenZef(world: WorldState): WorldState {
  // Check Fen preconditions (from advanceFen2)
  if (world.fen !== "pex") {
    throw new Error("lockFenZef: Fen must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("lockFenZef: requires Osk to be 'pex'");
  }

  // Check Zef preconditions (from advanceZef2)
  if (world.zef !== "pex") {
    throw new Error("lockFenZef: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("lockFenZef: requires Tal to be 'pex'");
  }

  // Apply both transitions simultaneously
  return { ...world, fen: "dor", zef: "dor" };
}
