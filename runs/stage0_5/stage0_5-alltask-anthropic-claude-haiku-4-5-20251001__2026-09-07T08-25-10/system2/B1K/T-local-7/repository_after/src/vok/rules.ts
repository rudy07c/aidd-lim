import { WorldState } from "../world";

export function advanceVok1(w: WorldState): WorldState {
  // nim -> pex
  if (w.vok === "nim") {
    return { ...w, vok: "pex" };
  }
  throw new Error(`advanceVok1 requires vok=nim, got ${w.vok}`);
}

export function advanceVok2(w: WorldState): WorldState {
  // pex -> dor
  if (w.vok === "pex") {
    return { ...w, vok: "dor" };
  }
  throw new Error(`advanceVok2 requires vok=pex, got ${w.vok}`);
}

export function fullResetVok(w: WorldState): WorldState {
  // dor -> nim (complete reset)
  if (w.vok === "dor") {
    return { ...w, vok: "nim" };
  }
  throw new Error(`fullResetVok requires vok=dor, got ${w.vok}`);
}
