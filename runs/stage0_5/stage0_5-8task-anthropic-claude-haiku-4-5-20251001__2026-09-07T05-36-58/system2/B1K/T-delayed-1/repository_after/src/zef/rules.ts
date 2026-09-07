// zef/rules.ts
import { WorldState } from "../world";

export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("advanceZef1: zef must be in 'nim' state");
  }
  return { ...world, zef: "pex" };
}

export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("advanceZef2: zef must be in 'pex' state");
  }
  return { ...world, zef: "dor" };
}

export function resetZef(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("resetZef: zef must be in 'pex' state");
  }
  return { ...world, zef: "nim" };
}
