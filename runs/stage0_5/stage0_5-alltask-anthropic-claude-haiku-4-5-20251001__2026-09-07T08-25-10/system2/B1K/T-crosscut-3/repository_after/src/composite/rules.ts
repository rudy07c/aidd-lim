import { WorldState } from "../world";

/**
 * Advance both Osk and Fen from 'nim' to 'pex' simultaneously.
 */
export function advanceOskFen(w: WorldState): WorldState {
  if (w.osk !== "nim") {
    throw new Error("osk is not in nim state");
  }
  if (w.fen !== "nim") {
    throw new Error("fen is not in nim state");
  }
  return {
    ...w,
    osk: "pex",
    fen: "pex",
  };
}
