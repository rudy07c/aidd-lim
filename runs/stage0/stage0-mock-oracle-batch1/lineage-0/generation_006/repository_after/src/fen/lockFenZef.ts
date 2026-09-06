import { WorldState } from "../world";

/**
 * lockFenZef (= O21): Fen: pex -> dor  AND  Zef: pex -> dor  [複合operation]
 * preconditions: Osk must be 'pex' AND Tal must be 'pex'
 *
 * I3 (explicit): Fen=dor → Osk=pex  (Osk=pex precondition で保証)
 * I6 (distributed): Fen=dor → Tal=pex  (Tal=pex precondition で保証)
 * I2 (explicit): Zef=dor → Tal=pex  (同じ precondition で保証)
 * I5 (distributed): Zef=dor → Osk=pex  (同じ precondition で保証)
 */
export function lockFenZef(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("lockFenZef: Fen must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("lockFenZef: Zef must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("lockFenZef: requires Osk to be 'pex' (Invariants I3+I5 guard)");
  }
  if (world.tal !== "pex") {
    throw new Error("lockFenZef: requires Tal to be 'pex' (Invariants I2+I6 guard)");
  }
  return { ...world, fen: "dor", zef: "dor" };
}
