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
 * turboVokZef: Performance optimization that advances both Vok and Zef from 'pex' to 'dor' simultaneously.
 * Requires: Vok='pex', Zef='pex', Osk='pex' (for advanceVok2), Tal='pex' (for advanceZef2), Fen='pex' (for advanceZef2)
 * This is equivalent to executing advanceVok2 and advanceZef2 in sequence, but as a single atomic operation.
 */
export function turboVokZef(world: WorldState): WorldState {
  // Check Vok preconditions (from advanceVok2)
  if (world.vok !== "pex") {
    throw new Error("turboVokZef: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("turboVokZef: Zef must be in state 'pex'");
  }
  if (world.osk !== "pex") {
    throw new Error("turboVokZef: requires Osk to be 'pex'");
  }

  // Check Zef preconditions (from advanceZef2)
  if (world.tal !== "pex") {
    throw new Error("turboVokZef: requires Tal to be 'pex'");
  }
  if (world.fen !== "pex") {
    throw new Error("turboVokZef: requires Fen to be 'pex'");
  }

  // Advance both simultaneously
  return { ...world, vok: "dor", zef: "dor" };
}
