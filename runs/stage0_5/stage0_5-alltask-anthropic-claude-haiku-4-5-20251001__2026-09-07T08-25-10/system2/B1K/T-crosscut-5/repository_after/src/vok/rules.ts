// vok/rules.ts - Vok entity operations and multi-entity operations

import { WorldState } from "../world";

export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1: vok must be in 'nim' state");
  }
  return { ...world, vok: "pex" };
}

export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVok2: vok must be in 'pex' state");
  }
  return { ...world, vok: "dor" };
}

export function boostTalFen(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("boostTalFen: tal must be in 'nim' state");
  }
  if (world.fen !== "nim") {
    throw new Error("boostTalFen: fen must be in 'nim' state");
  }
  return { ...world, tal: "pex", fen: "pex" };
}
