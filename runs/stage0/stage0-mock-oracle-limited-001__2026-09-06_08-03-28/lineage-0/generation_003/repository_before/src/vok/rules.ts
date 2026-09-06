
/**
 * forceAdvanceVok (= O12): Vok: nim -> dor (直接ジャンプ)
 * requires Tal === "pex" AND Osk === "pex"
 *
 * Invariant I1（Vok=dor ならば Tal=pex）を保つため Tal=pex が必要。
 * Invariant I4（Vok=dor ならば Osk=pex）を保つため Osk=pex が必要。
 */
export function forceAdvanceVok(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("forceAdvanceVok: Vok must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("forceAdvanceVok: requires Tal to be 'pex' (Invariant I1)");
  }
  if (world.osk !== "pex") {
    throw new Error("forceAdvanceVok: requires Osk to be 'pex' (Invariant I4)");
  }
  return { ...world, vok: "dor" };
}
