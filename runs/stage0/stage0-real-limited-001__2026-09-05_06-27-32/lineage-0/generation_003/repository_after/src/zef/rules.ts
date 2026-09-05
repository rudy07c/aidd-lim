import { WorldState } from "../world";

/**
 * advanceZef1 (= O3): Zef: nim -> pex, requires Tal === "pex"
 * (D2: O3 depends on E3)
 */
export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("advanceZef1: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef1: Tal must be in state 'pex'");
  }
  return { ...world, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal === "pex"
 * (D2: O4 depends on E3)
 */
export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("advanceZef2: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef2: Tal must be in state 'pex'");
  }
  return { ...world, zef: "dor" };
}

/**
 * fastTrackZef: Zef: nim -> dor directly, requires Tal === "pex"
 * Bypasses the intermediate 'pex' state for performance.
 */
export function fastTrackZef(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("fastTrackZef: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("fastTrackZef: Tal must be in state 'pex'");
  }
  return { ...world, zef: "dor" };
}

/**
 * resetZef: Zef: any -> nim
 */
export function resetZef(world: WorldState): WorldState {
  return { ...world, zef: "nim" };
}

/**
 * kindleBoth: Vok and Zef both nim -> pex (atomic operation)
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.vok !== "nim" || world.zef !== "nim") {
    throw new Error("kindleBoth: both Vok and Zef must be in state 'nim'");
  }
  return { ...world, vok: "pex", zef: "pex" };
}
