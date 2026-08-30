import { WorldState } from "../world";

/**
 * kindleBoth: Advance both Tal and Zef to 'pex' atomically.
 * Tal goes from nim -> pex (no preconditions)
 * Zef goes from nim -> pex (requires Tal to be 'pex', which is satisfied by this operation)
 */
export function kindleBoth(w: WorldState): WorldState {
  if (w.tal !== "nim") {
    throw new Error("kindleBoth requires tal to be 'nim'");
  }
  if (w.zef !== "nim") {
    throw new Error("kindleBoth requires zef to be 'nim'");
  }
  return { ...w, tal: "pex", zef: "pex" };
}
