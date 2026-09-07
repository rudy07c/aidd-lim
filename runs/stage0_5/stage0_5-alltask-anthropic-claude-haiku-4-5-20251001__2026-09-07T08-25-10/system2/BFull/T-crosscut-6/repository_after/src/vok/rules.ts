import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex, no preconditions
 */
export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in state 'nim'");
  }
  return { ...world, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef === "pex" AND Osk === "pex"
 * (D1: O2 depends on E2)
 * (D2: O2 depends on E5 — Invariant I4: Vok=dor → Osk=pex, explicit cross-chain)
 */
export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVok2: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("advanceVok2: requires Zef to be 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("advanceVok2: requires Osk to be 'pex'");
  }
  return { ...world, vok: "dor" };
}

/**
 * jumpVokFen (= O9): Vok: nim -> dor AND Fen: nim -> dor simultaneously,
 * skipping intermediate 'pex' states. Performance optimization.
 * Requires: Vok === "nim", Fen === "nim", Zef === "pex", Osk === "pex", Tal === "pex"
 * (Zef=pex and Tal=pex satisfy the distributed invariants for both Vok=dor and Fen=dor)
 */
export function jumpVokFen(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("jumpVokFen: Vok must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("jumpVokFen: Fen must be in state 'nim'");
  }
  if (world.zef !== "pex") {
    throw new Error("jumpVokFen: requires Zef to be 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpVokFen: requires Osk to be 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpVokFen: requires Tal to be 'pex'");
  }
  return { ...world, vok: "dor", fen: "dor" };
}
