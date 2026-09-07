import { WorldState } from "../world";

export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") throw new Error("Zef is not in nim state");
  return { ...w, zef: "pex" };
}

export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") throw new Error("Zef is not in pex state");
  return { ...w, zef: "dor" };
}
