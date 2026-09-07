import { WorldState } from "../world";

export function advanceTal1(world: WorldState): WorldState {
  if (world.tal !== "nim") {
    throw new Error(`advanceTal1 requires tal to be 'nim', got '${world.tal}'`);
  }
  return { ...world, tal: "pex" };
}
