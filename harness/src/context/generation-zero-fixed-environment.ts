import { createHash } from "crypto";
import {
  createFixedEnvironmentBinding,
  FixedEnvironmentBinding,
} from "./fixed-environment-runtime";
import {
  FIXED_WORLD_PROTOCOL_SPEC,
  FIXED_WORLD_PROTOCOL_SPEC_VERSION,
} from "./fixed-world-protocol-spec";
import {
  serializeStaticRepositoryPayload,
  STATIC_REPOSITORY_SERIALIZER_VERSION,
} from "./static-exposure";

export const GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION =
  "p6-3-v3-generation-zero-fixed-environment-builder-v1" as const;

/**
 * The repository-hashing rule this builder uses. Deliberately reuses the
 * already-frozen EL structural-freeze static repository serialization
 * (`serializeStaticRepositoryPayload` in ./static-exposure.ts: sorted file
 * path order, "\n--- <path> ---\n<content>\n" per file) rather than inventing
 * a second, divergent canonicalization rule for the same repository content.
 */
export const GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION =
  STATIC_REPOSITORY_SERIALIZER_VERSION;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Build the single Generation-0 `FixedEnvironmentBinding` for a P6-3 v3
 * treatment family.
 *
 * Interface contract this builder exists to satisfy (frozen upstream of any
 * M/Rsem executor design): a run calls this function EXACTLY ONCE, at run
 * start, from the Generation-0 repository snapshot. The resulting binding is
 * then passed, byte-for-byte unchanged, into every generation/condition/arm/
 * repeat of that run. No M cell, no Rsem cell, and no per-arm code path may
 * call this function (or `createFixedEnvironmentBinding` directly) itself —
 * doing so would silently create a second, potentially-divergent `E_fixed`
 * identity instead of reusing the one run-fixed binding.
 *
 * This function does not read any scientific outcome, ground truth,
 * invariant, or hidden-evaluator data, and makes no provider/network call.
 * It also does not wire into `executeP63MCell` / `executeP63RSemCell` /
 * `orchestrator.ts` — that connection is a separate, later PR.
 */
export function buildGenerationZeroFixedEnvironment(args: {
  repositoryFiles: Readonly<Record<string, string>>;
}): Readonly<FixedEnvironmentBinding> {
  const { repositoryFiles } = args;
  if (Object.keys(repositoryFiles).length === 0) {
    throw new Error("Generation-0 repositoryFiles must not be empty");
  }

  const sourceRepositorySha256 = sha256(
    serializeStaticRepositoryPayload(repositoryFiles)
  );
  const surfaceSpecSha256 = sha256(FIXED_WORLD_PROTOCOL_SPEC);

  return createFixedEnvironmentBinding({
    sourceRepositorySha256,
    surfaceSpecVersion: FIXED_WORLD_PROTOCOL_SPEC_VERSION,
    surfaceSpecSha256,
    modelVisibleText: FIXED_WORLD_PROTOCOL_SPEC,
  });
}
