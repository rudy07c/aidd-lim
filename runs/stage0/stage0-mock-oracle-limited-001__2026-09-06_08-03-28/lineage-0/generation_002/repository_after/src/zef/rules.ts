
/**
 * resetZef (= O8): Zef: pex -> nim (リセット操作)
 * no preconditions.
 *
 * Talには触れないため、Talの単調性（非後退性）は保たれる。
 */
export function resetZef(world: WorldState): WorldState {
  if (world.zef !== "pex") {
    throw new Error("resetZef: Zef must be in state 'pex'");
  }
  return { ...world, zef: "nim" };
}
