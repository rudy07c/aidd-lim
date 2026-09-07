import { WorldState } from "../world";

/**
 * lockFenZef: Fen and Zef simultaneously transition pex -> dor
 * Requires: Fen=pex, Zef=pex, Tal=pex, Osk=pex
 * (Combined preconditions of advanceFen2 and advanceZef2 for performance)
 */
export function lockFenZef(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("lockFenZef: Fen must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("lockFenZef: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("lockFenZef: requires Tal to be 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("lockFenZef: requires Osk to be 'pex'");
  }
  return { ...world, fen: "dor", zef: "dor" };
}
