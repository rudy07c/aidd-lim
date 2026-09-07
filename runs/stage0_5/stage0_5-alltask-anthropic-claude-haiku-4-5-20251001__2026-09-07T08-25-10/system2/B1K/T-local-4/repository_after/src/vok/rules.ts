import { WorldState } from "../world";

export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error(`advanceVok1 requires vok to be 'nim', got '${world.vok}'`);
  }
  return { ...world, vok: "pex" };
}

export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error(`advanceVok2 requires vok to be 'pex', got '${world.vok}'`);
  }
  return { ...world, vok: "dor" };
}

export function recoverVok(world: WorldState): WorldState {
  if (world.vok !== "dor") {
    throw new Error(`recoverVok requires vok to be 'dor', got '${world.vok}'`);
  }
  return { ...world, vok: "pex" };
}
