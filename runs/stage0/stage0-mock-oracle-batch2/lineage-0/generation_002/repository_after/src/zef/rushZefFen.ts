import { WorldState } from "../world";

/**
 * rushZefFen (= O23): Zef: nim -> dor  AND  Fen: nim -> dor  [複合operation]
 * requires Tal === "pex" AND Osk === "pex"
 *
 * I2 (explicit): E2=dor → Tal=pex  (Tal=pex precondition で保証)
 * I3 (explicit): E4=dor → Osk=pex  (Osk=pex precondition で保証)
 * I5 (distributed): E2=dor → Osk=pex  (Osk=pex precondition で直接保証)
 * I6 (distributed): E4=dor → Tal=pex  (Tal=pex precondition で直接保証)
 */
export function rushZefFen(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("rushZefFen: Zef must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("rushZefFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("rushZefFen: requires Tal to be 'pex' (Invariants I2+I6 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("rushZefFen: requires Osk to be 'pex' (Invariants I3+I5 guard)");
  }
  return { ...world, zef: "dor", fen: "dor" };
}
