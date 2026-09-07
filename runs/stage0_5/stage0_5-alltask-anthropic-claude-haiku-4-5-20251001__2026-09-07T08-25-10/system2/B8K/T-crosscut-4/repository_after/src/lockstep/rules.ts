import { WorldState } from "../world";

/**
 * lockFenZef (= O9): Fen & Zef: pex -> dor simultaneously
 * Requires Fen=pex, Zef=pex, Osk=pex, Tal=pex
 * (combines advanceFen2 and advanceZef2 preconditions)
 */
export function lockFenZef(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("lockFenZef: Fen must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("lockFenZef: Zef must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("lockFenZef: requires Osk to be 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("lockFenZef: requires Tal to be 'pex'");
  }
  return { ...world, fen: "dor", zef: "dor" };
}
