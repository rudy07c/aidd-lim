import { WorldState } from "../world";

/**
 * advanceTal1 (= O5): Tal: nim -> pex, no preconditions
 */
export function advanceTal1(w: WorldState): WorldState {
  if (w.tal !== "nim") {
    throw new Error("advanceTal1: tal must be 'nim'");
  }
  return { ...w, tal: "pex" };
}
