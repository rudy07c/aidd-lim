import { WorldState } from "../world";

/**
 * advanceFen1 (= O7): Fen: nim -> pex, requires Osk === "pex"
 * (D6: O7 depends on E5)
 */
export function advanceFen1(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error("advanceFen1: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("advanceFen1: requires Osk to be 'pex'");
  }
  return { ...world, fen: "pex" };
}

/**
 * advanceFen2 (= O8): Fen: pex -> dor, requires Osk === "pex" AND Zef === "pex"
 * (D7: O8 depends on E5, D8: O8 depends on E2)
 */
export function advanceFen2(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("advanceFen2: Fen must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("advanceFen2: requires Osk to be 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("advanceFen2: requires Zef to be 'pex'");
  }
  return { ...world, fen: "dor" };
}

/**
 * jumpFen (performance optimization): Fen: nim -> dor, requires Osk === "pex" AND Zef === "pex"
 * This combines advanceFen1 and advanceFen2 in a single operation, skipping the 'pex' intermediate state.
 */
export function jumpFen(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error("jumpFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpFen: requires Osk to be 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("jumpFen: requires Zef to be 'pex'");
  }
  return { ...world, fen: "dor" };
}
