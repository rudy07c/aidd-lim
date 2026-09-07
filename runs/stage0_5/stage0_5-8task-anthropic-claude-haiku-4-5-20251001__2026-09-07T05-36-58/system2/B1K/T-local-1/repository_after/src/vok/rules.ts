import { WorldState } from "../world";

export function advanceVok1(world: WorldState): WorldState {
  // nim -> pex
  if (world.vok === "nim") {
    return { ...world, vok: "pex" };
  }
  throw new Error(`advanceVok1: invalid state transition from ${world.vok}`);
}

export function advanceVok2(world: WorldState): WorldState {
  // pex -> dor
  if (world.vok === "pex") {
    return { ...world, vok: "dor" };
  }
  throw new Error(`advanceVok2: invalid state transition from ${world.vok}`);
}

export function forceAdvanceVok(world: WorldState): WorldState {
  // nim -> dor (forced, single operation)
  if (world.vok === "nim") {
    return { ...world, vok: "dor" };
  }
  throw new Error(`forceAdvanceVok: can only force advance from nim state, current state is ${world.vok}`);
}
