import { WorldState } from "../world";

/**
 * turboVokZef (= O24): Vok: pex -> dor  AND  Zef: pex -> dor  [複合operation]
 * requires Tal === "pex" AND Osk === "pex"
 *
 * I1 (distributed): E1=dor → Tal=pex  (Tal=pex precondition で保証)
 * I2 (explicit): E2=dor → Tal=pex  (同じ precondition で保証)
 * I4 (explicit): E1=dor → Osk=pex  (Osk=pex precondition で保証)
 * I5 (distributed): E2=dor → Osk=pex  (同じ precondition で保証)
 */
export function turboVokZef(world: WorldState): WorldState {
  if (world.vok !== "pex") {
    throw new Error("turboVokZef: Vok must be in state 'pex'");
  }
  if (world.zef !== "pex") {
    throw new Error("turboVokZef: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("turboVokZef: requires Tal to be 'pex' (Invariants I1+I2 guard)");
  }
  if (world.osk !== "pex") {
    throw new Error("turboVokZef: requires Osk to be 'pex' (Invariants I4+I5 guard)");
  }
  return { ...world, vok: "dor", zef: "dor" };
}
