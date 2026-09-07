import { WorldState } from "../world";

export function advanceOsk1(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOsk1: osk must be in 'nim' state");
  }
  return { ...world, osk: "pex" };
}
