import { WorldState } from "../world";

/**
 * advanceZef1 (= O3): Zef: nim -> pex, requires Tal === "pex"
 * (D2: O3 depends on E3)
 *
 * このpreconditionが、Invariant I1（Vok=dor ならば Tal=pex）を
 * "distributed" に成立させる根拠の一部である。advanceVok2自体はTalを
 * 一切参照しないが、advanceVok2の前提であるZef=pexへ到達するには
 * 必ずこのpreconditionを経由するため、結果としてTal=pexが連鎖的に
 * 保証される（Talは後退しないため、一度pexになれば恒久的に成立する）。
 */
export function advanceZef1(world: WorldState): WorldState {
  if (world.zef !== "nim") {
    throw new Error("advanceZef1: Zef must be in state 'nim'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef1: requires Tal to be 'pex'");
  }
  return { ...world, zef: "pex" };
}

/**
 * advanceZef2 (= O4): Zef: pex -> dor, requires Tal === "pex"
 * (D3: O4 depends on E3)
 *
 * Invariant I2（Zef=dor ならば Tal=pex）は、このpreconditionが
 * 直接強制している（"explicit"）。
 */
export function advanceZef2(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("advanceZef2: Zef must be in state 'pex'");
  }
  if (world.tal !== "pex") {
    throw new Error("advanceZef2: requires Tal to be 'pex'");
  }
  return { ...world, zef: "dor" };
}

/**
 * kindleBoth: Zef and Tal: nim -> pex, simultaneously
 * No preconditions on other entities.
 * Advances both Zef and Tal from 'nim' to 'pex' in a single atomic operation.
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