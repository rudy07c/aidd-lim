import { WorldState } from "../world";

/**
 * advanceVokSkip (= O25): Vok: pex -> dor (高速スキップ)
 * requires Tal === "pex" AND Osk === "pex"
 *
 * Invariant I1 (distributed): E1=dor → Tal=pex  (Tal=pex precondition で保証)
 * Invariant I4 (explicit): E1=dor → Osk=pex  (Osk=pex precondition で保証)
 */
export function advanceVokSkip(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVokSkip: Vok must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceVokSkip: requires Tal to be 'pex' (Invariant I1 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("advanceVokSkip: requires Osk to be 'pex' (Invariant I4 guard)");
  }
  return { ...world, vok: "dor" };
}
