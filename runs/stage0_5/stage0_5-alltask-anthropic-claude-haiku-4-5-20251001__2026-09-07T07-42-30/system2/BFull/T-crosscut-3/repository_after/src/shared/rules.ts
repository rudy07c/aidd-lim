import { WorldState } from "../world";

/**
 * advanceOskFen: Osk and Fen: nim -> pex simultaneously
 * requires Osk === "nim" AND Fen === "nim"
 */
export function advanceOskFen(world: WorldState): WorldState {
  if (world.osk !== "nim") {
    throw new Error("advanceOskFen: Osk must be in state 'nim'");
  }
  if (world.fen !== "nim") {
    throw new Error("advanceOskFen: Fen must be in state 'nim'");
  }
  return { ...world, osk: "pex", fen: "pex" };
}
