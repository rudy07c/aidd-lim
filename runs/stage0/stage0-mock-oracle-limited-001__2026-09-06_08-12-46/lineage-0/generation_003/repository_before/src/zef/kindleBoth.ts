import { WorldState } from "../world";

/**
 * kindleBoth (= O13): Zef: nim -> pex  AND  Tal: nim -> pex  [複合operation]
 * no preconditions beyond the fromState guards.
 *
 * 1 operationで複数entityを同時に変更するcross-entity operation。
 */
export function kindleBoth(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("kindleBoth: Zef must be in state 'nim'");
  }
  if (world.tal !== "nim") {
    throw new Error("kindleBoth: Tal must be in state 'nim'");
  }
  return { ...world, zef: "pex", tal: "pex" };
}
