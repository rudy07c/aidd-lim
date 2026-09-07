import { WorldState } from "../world";

export function advanceZef1(world: WorldState): WorldState {
  // Transition Zef from 'nim' to 'pex'
  if (world.zef !== "nim") {
    throw new Error(`advanceZef1: expected zef='nim', got '${world.zef}'`);
  }
  return { ...world, zef: "pex" };
}

export function advanceZef2(world: WorldState): WorldState {
  // Transition Zef from 'pex' to 'dor'
  if (world.zef !== "pex") {
    throw new Error(`advanceZef2: expected zef='pex', got '${world.zef}'`);
  }
  return { ...world, zef: "dor" };
}

export function resetZef(world: WorldState): WorldState {
  // Transition Zef from 'pex' to 'nim'
  if (world.zef !== "pex") {
    throw new Error(`resetZef: expected zef='pex', got '${world.zef}'`);
  }
  return { ...world, zef: "nim" };
}
