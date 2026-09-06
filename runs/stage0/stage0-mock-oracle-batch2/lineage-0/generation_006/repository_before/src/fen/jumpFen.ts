import { WorldState } from "../world";

/**
 * jumpFen (= O22): Fen: nim -> dor (直接ジャンプ)
 * requires Osk === "pex" AND Tal === "pex"
 *
 * Invariant I3 (explicit): E4=dor → E5=pex  (Osk=pex precondition で保証)
 * Invariant I6 (distributed): E4=dor → E3=pex  (Tal=pex precondition で保証)
 */
export function jumpFen(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error("jumpFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpFen: requires Osk to be 'pex' (Invariant I3 guard)");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpFen: requires Tal to be 'pex' (Invariant I6 guard)");
  }
  return { ...world, fen: "dor" };
}
