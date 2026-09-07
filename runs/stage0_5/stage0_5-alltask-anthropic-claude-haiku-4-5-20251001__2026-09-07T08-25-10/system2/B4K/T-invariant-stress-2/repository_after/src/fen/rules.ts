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
 * (D7: O8 depends on E5 — Invariant I3: Fen=dor → Osk=pex, explicit)
 * (D8: O8 depends on E2 — Invariant I6: Fen=dor → Tal=pex, distributed via Zef=pex → Tal=pex chain)
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
 * jumpFen (performance optimization): Fen: nim -> dor directly
 * Requires Osk === "pex" AND Zef === "pex" (same constraints as advanceFen1 + advanceFen2)
 * Skips the intermediate 'pex' state for performance
 * (D6: depends on E5; D8: depends on E2)
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
