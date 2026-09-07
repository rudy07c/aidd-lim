import { WorldState } from "../world";

export function advanceZef1(w: WorldState): WorldState {
  if (w.zef !== "nim") throw new Error("advanceZef1 requires zef to be 'nim'");
  return { ...w, zef: "pex" };
}

export function advanceZef2(w: WorldState): WorldState {
  if (w.zef !== "pex") throw new Error("advanceZef2 requires zef to be 'pex'");
  return { ...w, zef: "dor" };
}
