// world.ts — Architecture A (entity-oriented) の共有state container
// 命名方式A（難読化symbol）を適用:
//   E1=Vok, E2=Zef, E3=Tal / q1=nim, q2=pex, q3=dor
//   E4=Fen, E5=Osk / q1=nim, q2=pex, q3=dor (E4) / q1=nim, q2=pex (E5)

export type VokState = "nim" | "pex" | "dor";
export type ZefState = "nim" | "pex" | "dor";
export type TalState = "nim" | "pex";
export type FenState = "nim" | "pex" | "dor";
export type OskState = "nim" | "pex";

export interface WorldState {
  vok: VokState;
  zef: ZefState;
  tal: TalState;
  fen: FenState;
  osk: OskState;
}

export function createInitialWorld(): WorldState {
  return { vok: "nim", zef: "nim", tal: "nim", fen: "nim", osk: "nim" };
}
