import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex
 * No preconditions.
 */
export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: Vok must be in state 'nim'");
  }
  return { ...world, vok: "pex" };
}

/**
 * advanceVok2 (= O2): Vok: pex -> dor, requires Zef === "pex" AND Osk === "pex"
 * (D1: O2 depends on E2, D2: O2 depends on E5)
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
 * jumpVokZef: Performance optimization that advances both Vok and Zef from 'nim' to 'dor' in one operation.
 * Requires all preconditions for both advanceVok2 and advanceZef2:
 * - Vok must be 'nim'
 * - Zef must be 'nim'
 * - Tal must be 'pex' (precondition for advanceZef2)
 * - Osk must be 'pex' (precondition for advanceVok2)
 * - Fen must be 'pex' (precondition for advanceZef2)
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