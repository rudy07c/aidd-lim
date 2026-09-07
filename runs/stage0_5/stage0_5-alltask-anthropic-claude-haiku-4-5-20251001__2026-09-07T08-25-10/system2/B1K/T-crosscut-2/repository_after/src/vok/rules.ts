// src/vok/rules.ts
// Vok entity の遷移ルール

import { WorldState } from "../world";

export function advanceVok1(w: WorldState): WorldState {
  return { ...w, vok: "pex" };
}

export function advanceVok2(w: WorldState): WorldState {
  return { ...w, vok: "dor" };
}

export function jumpVokZef(w: WorldState): WorldState {
  return { ...w, vok: "dor", zef: "dor" };
}
