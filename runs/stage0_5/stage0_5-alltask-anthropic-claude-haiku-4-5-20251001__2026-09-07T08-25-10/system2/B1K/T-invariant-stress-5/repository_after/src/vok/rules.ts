import { WorldState } from "../world";

export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error("advanceVok1 requires vok to be in 'nim' state");
  }
  return { ...world, vok: "pex" };
}

export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVok2 requires vok to be in 'pex' state");
  }
  return { ...world, vok: "dor" };
}

export function advanceVokSkip(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("advanceVokSkip requires vok to be in 'pex' state");
  }
  return { ...world, vok: "dor" };
}
