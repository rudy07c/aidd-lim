import { WorldState } from "../world";

export function advanceOsk1(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error(`advanceOsk1 requires osk to be 'nim', got '${world.osk}'`);
  }
  return { ...world, osk: "pex" };
}
