import { WorldState } from "../world";

export function advanceTal1(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error("advanceTal1: tal must be in 'nim' state");
  }
  return { ...world, tal: "pex" };
}
