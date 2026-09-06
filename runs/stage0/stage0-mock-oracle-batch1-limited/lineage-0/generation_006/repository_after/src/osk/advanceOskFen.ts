import { WorldState } from "../world";

/**
 * advanceOskFen (= O20): Osk: nim -> pex  AND  Fen: nim -> pex  [複合operation]
 * no preconditions beyond the fromState guards.
 *
 * O6（advanceOsk1）とO7（advanceFen1）を1 operationに集約した効率化パターン。
 * どちらも q2 止まりなので invariant 違反なし。
 */
export function advanceOskFen(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOskFen: Osk must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("advanceOskFen: Fen must be in state 'nim'");
  }
  return { ...world, osk: "pex", fen: "pex" };
}
