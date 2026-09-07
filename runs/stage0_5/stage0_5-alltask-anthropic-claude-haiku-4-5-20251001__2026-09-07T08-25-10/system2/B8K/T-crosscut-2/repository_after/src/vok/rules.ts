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
 * jumpVokZef: Vok: nim -> dor AND Zef: nim -> dor in a single operation
 * Requires: Tal === "pex", Osk === "pex", Fen === "pex"
 * This is a performance optimization that bypasses intermediate 'pex' states.
 */
export function jumpVokZef(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("jumpVokZef: Vok must be in state 'nim'");
  }
  if (world.zef !== "nim") {
    throw new Error("jumpVokZef: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("jumpVokZef: requires Tal to be 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("jumpVokZef: requires Osk to be 'pex'");
  }
  if (world.fen !== "pex") {
    throw new Error("jumpVokZef: requires Fen to be 'pex'");
  }
  return { ...world, vok: "dor", zef: "dor" };
}