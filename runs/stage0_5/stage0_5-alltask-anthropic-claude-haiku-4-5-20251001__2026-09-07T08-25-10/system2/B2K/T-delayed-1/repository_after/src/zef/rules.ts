import { WorldState } from "../world";

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
 * resetZef (= reset operation): Zef: pex -> nim
 * Allows reverting Zef from 'pex' back to 'nim'
 */
export function resetZef(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("resetZef: Zef must be in state 'pex'");
  }
  return { ...world, zef: "nim" };
}
