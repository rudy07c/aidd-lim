import { WorldState } from "../world";

/**
 * rushZefFen (= O9): Combined operation that transitions both Zef and Fen from 'nim' to 'dor' directly.
 * Requires Tal === "pex" (for Zef→dor invariant I2)
 * Requires Osk === "pex" (for Fen→dor invariant I3)
 * 
 * This operation bypasses intermediate 'pex' states for performance optimization.
 */
export function rushZefFen(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("rushZefFen: Zef must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("rushZefFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("rushZefFen: requires Tal to be 'pex' (for Zef→dor)");
  }
  if (world.osk !== "pex") {
    throw new Error("rushZefFen: requires Osk to be 'pex' (for Fen→dor)");
  }
  return { ...world, zef: "dor", fen: "dor" };
}
