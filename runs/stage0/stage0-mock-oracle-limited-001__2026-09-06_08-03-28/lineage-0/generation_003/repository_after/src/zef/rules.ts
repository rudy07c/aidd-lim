
/**
 * fastTrackZef (= O9): Zef: nim -> dor (中間のpexを経由せず直接ジャンプ)
 * requires Tal === "pex" AND Fen === "pex"
 *
 * Invariant I2（Zef=dor ならば Tal=pex）を保つため Tal=pex が必要。
 * Invariant I5（Zef=dor ならば Osk=pex）を distributed chain で保つため
 * Fen=pex が必要（advanceFen1 precondition により Osk=pex が保証される）。
 * visibleInstructionには「preconditionが必要」と書かれていないが、
 * invariantを壊さないためには必須。（invariant_stressing task）
 */
export function fastTrackZef(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("fastTrackZef: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("fastTrackZef: requires Tal to be 'pex' (Invariant I2)");
  }
  if (world.fen !== "pex") {
    throw new Error("fastTrackZef: requires Fen to be 'pex' (Invariant I5 via distributed chain)");
  }
  return { ...world, zef: "dor" };
}
