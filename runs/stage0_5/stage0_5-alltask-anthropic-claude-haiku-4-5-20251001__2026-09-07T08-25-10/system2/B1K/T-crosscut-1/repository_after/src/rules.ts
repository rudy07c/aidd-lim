// combined rules for cross-entity operations
import { WorldState } from "./world";

export function kindleBoth(w: WorldState): WorldState {
  if (w.zef !== "nim") {
    throw new Error(`kindleBoth: expected zef=nim, got ${w.zef}`);
  }
  if (w.tal !== "nim") {
    throw new Error(`kindleBoth: expected tal=nim, got ${w.tal}`);
  }
  return { ...w, zef: "pex", tal: "pex" };
}
