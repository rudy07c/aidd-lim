import { WorldState } from "../world";

/**
 * jumpVokFen (= O27): Vok: nim -> dor  AND  Fen: nim -> dor  [複合operation]
 * requires Tal === "pex" AND Osk === "pex"
 *
 * I1 (distributed): E1=dor → Tal=pex  (Tal=pex precondition で保証)
 * I3 (explicit): E4=dor → Osk=pex  (Osk=pex precondition で保証)
 * I4 (explicit): E1=dor → Osk=pex  (同じ precondition で保証)
 * I6 (distributed): E4=dor → Tal=pex  (同じ precondition で保証)
 */
export function jumpVokFen(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("jumpVokFen: Vok must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("jumpVokFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpVokFen: requires Tal to be 'pex' (Invariants I1+I6 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpVokFen: requires Osk to be 'pex' (Invariants I3+I4 guard)");
  }
  return { ...world, vok: "dor", fen: "dor" };
}
