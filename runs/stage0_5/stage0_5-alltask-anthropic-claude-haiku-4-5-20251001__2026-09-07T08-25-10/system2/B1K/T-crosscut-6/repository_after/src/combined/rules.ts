import { WorldState } from "../world";

export function jumpVokFen(w: WorldState): WorldState {
  if (w.vok !== "nim") throw new Error("jumpVokFen requires vok to be 'nim'");
  if (w.fen !== "nim") throw new Error("jumpVokFen requires fen to be 'nim'");
  return { ...w, vok: "dor", fen: "dor" };
}
