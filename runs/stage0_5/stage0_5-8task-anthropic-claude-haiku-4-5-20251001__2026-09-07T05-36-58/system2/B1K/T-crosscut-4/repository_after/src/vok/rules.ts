import { WorldState } from "../world";

export function advanceVok1(world: WorldState): WorldState {
  if (world.vok !== "nim") {
    throw new Error(`invalid state for advanceVok1: expected nim, got ${world.vok}`);
  }
  return { ...world, vok: "pex" };
}

export function advanceVok2(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error(`invalid state for advanceVok2: expected pex, got ${world.vok}`);
  }
  return { ...world, vok: "dor" };
}

export function lockFenZef(world: WorldState): WorldState {
  if (world.fen !== "pex") {
    throw new Error(`invalid state for lockFenZef: expected fen pex, got ${world.fen}`);
  }
  if (world.zef !== "pex") {
    throw new Error(`invalid state for lockFenZef: expected zef pex, got ${world.zef}`);
  }
  return { ...world, fen: "dor", zef: "dor" };
}
