import { WorldState } from "../world";

export function advanceTal1(w: WorldState): WorldState {
  if (w.tal !== "nim") {
    throw new Error(`advanceTal1: expected tal=nim, got ${w.tal}`);
  }
  return { ...w, tal: "pex" };
}
