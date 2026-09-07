import { WorldState } from "../world";

export function advanceFen1(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error(`advanceFen1 requires fen to be nim, but got ${world.fen}`);
  }
  return { ...world, fen: "pex" };
}

export function advanceFen2(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error(`advanceFen2 requires fen to be pex, but got ${world.fen}`);
  }
  return { ...world, fen: "dor" };
}

export function resetFen(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error(`resetFen requires fen to be pex, but got ${world.fen}`);
  }
  return { ...world, fen: "nim" };
}
