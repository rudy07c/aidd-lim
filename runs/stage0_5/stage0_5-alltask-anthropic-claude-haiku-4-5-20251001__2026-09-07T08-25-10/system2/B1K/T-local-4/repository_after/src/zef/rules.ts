import { WorldState } from "../world";

export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error(`advanceZef1 requires zef to be 'nim', got '${world.zef}'`);
  }
  return { ...world, zef: "pex" };
}

export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error(`advanceZef2 requires zef to be 'pex', got '${world.zef}'`);
  }
  return { ...world, zef: "dor" };
}
