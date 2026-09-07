import { WorldState } from "../world";

export function advanceTal1(w: WorldState): WorldState {
  if (w.tal !== "nim") throw new Error("advanceTal1 requires tal to be 'nim'");
  return { ...w, tal: "pex" };
}
