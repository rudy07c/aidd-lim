import { WorldState } from "../world";

/**
 * advanceVok1 (= O1): Vok: nim -> pex
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
 * advanceZef1 (= O3): Zef: nim -> pex, requires Tal === "pex"
 * (D3: O3 depends on E3)
 */
export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("advanceZef1: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef1: requires Tal to be 'pex'");
  }
  return { ...world, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal === "pex" AND Fen === "pex"
 * (D4: O4 depends on E3, D5: O4 depends on E4)
 */
export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("advanceZef2: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef2: requires Tal to be 'pex'");
  }
  if (world.fen !== "pex") {
    throw new Error("advanceZef2: requires Fen to be 'pex'");
  }
  return { ...world, zef: "dor" };
}

/**
 * advanceTal1 (= O5): Tal: nim -> pex
 */
export function advanceTal1(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTal1: Tal must be in state 'nim'");
  }
  return { ...world, tal: "pex" };
}

/**
 * boostTalFen: Tal and Fen both transition from nim -> pex simultaneously
 * Requires: Tal === "nim" AND Fen === "nim" AND Osk === "pex"
 * (Osk must be pex since Fen transition requires it)
 */
export function boostTalFen(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("boostTalFen: Tal must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("boostTalFen: Fen must be in state 'nim'");
  }
  if (world.osk !== "pex") {
    throw new Error("boostTalFen: requires Osk to be 'pex'");
  }
  return { ...world, tal: "pex", fen: "pex" };
}
