// Vok (Entity E1) のrules
// q1=nim, q2=pex, q3=dor

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

// Combined operation: advance both Tal and Osk from nim to pex
export function advanceTalOsk(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTalOsk: tal must be in 'nim' state");
  }
  if (world.osk !== "nim") {
    throw new Error("advanceTalOsk: osk must be in 'nim' state");
  }
  return { ...world, tal: "pex", osk: "pex" };
}
