import { WorldState } from "../world";

/**
 * advanceTalOsk (= O28): Tal: nim -> pex  AND  Osk: nim -> pex  [複合operation]
 * no preconditions beyond the fromState guards.
 *
 * advanceTal1（O5）と advanceOsk1（O6）を1 operationに集約した効率化パターン。
 * E3/E5 ともに q2 止まりなので invariant 違反なし。
 */
export function advanceTalOsk(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTalOsk: Tal must be in state 'nim'");
  }
  if (world.osk !== "nim") {
    throw new Error("advanceTalOsk: Osk must be in state 'nim'");
  }
  return { ...world, tal: "pex", osk: "pex" };
}
