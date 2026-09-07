import { WorldState } from "../world";

export function advanceZef1(world: WorldState): WorldState {
  return { ...world, zef: "pex" };
}

export function advanceZef2(world: WorldState): WorldState {
  return { ...world, zef: "dor" };
}

export function fastTrackZef(world: WorldState): WorldState {
  // Zef を 'nim' から 'dor' へ一気に進める（中間状態 'pex' をスキップ）
  if (world.zef !== "nim") {
    throw new Error("fastTrackZef: can only be applied when Zef is in 'nim' state");
  }
  return { ...world, zef: "dor" };
}
