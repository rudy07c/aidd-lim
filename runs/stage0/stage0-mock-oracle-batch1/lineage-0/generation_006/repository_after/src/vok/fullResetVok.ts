import { WorldState } from "../world";

/**
 * fullResetVok (= O19): Vok: dor -> nim (完全リセット)
 * no preconditions beyond fromState guard.
 */
export function fullResetVok(world: WorldState): WorldState {
  if (world.vok !== "dor") {
    throw new Error("fullResetVok: Vok must be in state 'dor'");
  }
  return { ...world, vok: "nim" };
}
