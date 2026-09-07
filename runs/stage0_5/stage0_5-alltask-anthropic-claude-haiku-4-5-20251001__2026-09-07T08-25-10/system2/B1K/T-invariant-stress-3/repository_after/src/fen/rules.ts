import { WorldState } from "../world";

export function advanceFen1(world: WorldState): WorldState {
  if (world.fen !== "nim") {
    throw new Error("advanceFen1: fen must be in 'nim' state");
  }
  return { ...world, fen: "pex" };
}

export function advanceFen2(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error("advanceFen2: fen must be in 'pex' state");
  }
  return { ...world, fen: "dor" };
}

export function rushZefFen(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("rushZefFen: zef must be in 'nim' state");
  }
  if (world.fen !== "nim") {
    throw new Error("rushZefFen: fen must be in 'nim' state");
  }
  return { ...world, zef: "dor", fen: "dor" };
}
