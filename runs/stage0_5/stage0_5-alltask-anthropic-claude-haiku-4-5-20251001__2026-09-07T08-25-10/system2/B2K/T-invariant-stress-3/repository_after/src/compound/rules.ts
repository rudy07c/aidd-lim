import { WorldState } from "../world";

/**
 * rushZefFen: Simultaneously advance Zef and Fen from 'nim' to 'dor'
 * Bypasses the intermediate 'pex' state for both entities.
 * 
 * Requires:
 * - Zef === "nim"
 * - Fen === "nim"
 * - Tal === "pex" (prerequisite for Zef transition)
 * - Osk === "pex" (prerequisite for Fen transition)
 */
export function rushZefFen(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("rushZefFen: Zef must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("rushZefFen: Fen must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("rushZefFen: requires Tal to be 'pex' (prerequisite for Zef transition)");
  }
  if (world.osk !== "pex") {
    throw new Error("rushZefFen: requires Osk to be 'pex' (prerequisite for Fen transition)");
  }
  return { ...world, zef: "dor", fen: "dor" };
}
