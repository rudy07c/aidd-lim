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
    throw new Error("advanceZef1: requires Tal === 'pex'");
  }
  return { ...world, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal === "pex"
 * (D4: O4 depends on E3)
 */
export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("advanceZef2: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef2: requires Tal === 'pex'");
  }
  return { ...world, zef: "dor" };
}

/**
 * resetZef (= manual reset): Zef: * -> nim
 */
export function resetZef(world: WorldState): WorldState {
  return { ...world, zef: "nim" };
}

/**
 * fastTrackZef (performance optimization): Zef: nim -> dor directly,
 * bypassing the 'pex' state. Requires Tal === "pex" as precondition.
 */
export function fastTrackZef(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("fastTrackZef: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("fastTrackZef: requires Tal === 'pex'");
  }
  return { ...world, zef: "dor" };
}
