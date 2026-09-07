import { WorldState } from "../world";

export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error(`advanceZef1: expected zef to be nim, got ${w.zef}`);
  }
  return { ...w, zef: "pex" };
}

export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") {
    throw new Error(`advanceZef2: expected zef to be pex, got ${w.zef}`);
  }
  return { ...w, zef: "dor" };
}

export function fastTrackZef(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error(`fastTrackZef: expected zef to be nim, got ${w.zef}`);
  }
  return { ...w, zef: "dor" };
}
