import { WorldState } from "../world";

/**
 * boostTalFen (= O26): Tal: nim -> pex  AND  Fen: nim -> pex  [複合operation]
 * requires Osk === "pex"  (advanceFen1 の E5=q2 依存を引き継ぐ)
 *
 * E3/E4 ともに q2 止まりなので invariant 違反なし。
 */
export function boostTalFen(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("boostTalFen: Tal must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("boostTalFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("boostTalFen: requires Osk to be 'pex' (Fen advancement dependency)");
  }
  return { ...world, tal: "pex", fen: "pex" };
}
