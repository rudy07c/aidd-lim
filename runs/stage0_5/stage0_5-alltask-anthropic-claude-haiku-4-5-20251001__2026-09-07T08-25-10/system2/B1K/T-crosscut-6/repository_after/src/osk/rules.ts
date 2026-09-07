import { WorldState } from "../world";

export function advanceOsk1(w: WorldState): WorldState {
  if (w.osk !== "nim") throw new Error("advanceOsk1 requires osk to be 'nim'");
  return { ...w, osk: "pex" };
}
