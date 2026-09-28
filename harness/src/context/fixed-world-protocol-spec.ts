export const FIXED_WORLD_PROTOCOL_SPEC_VERSION =
  "p6-3-v3-world-protocol-external-spec-v1" as const;

/**
 * Environment-level protocol surface shared by every experimental condition.
 *
 * This is deliberately NOT a serialization of src/protocol_adapter.ts. The
 * adapter implementation, operation table, entity mapping and repository code
 * remain artifact evidence. Only the fixed evaluator-facing boundary contract
 * is stated here so a worker is not asked to preserve an unobservable API.
 *
 * The generic WorldStateHandle name is intentionally opaque. The specification
 * fixes method arity, argument roles and result shape without exposing any
 * operation name, entity name, invariant, dependency or hidden-evaluator fact.
 */
export const FIXED_WORLD_PROTOCOL_SPEC = `FIXED WORLD PROTOCOL CONTRACT (environment specification; not repository evidence)

src/protocol_adapter.ts must export an object named protocol with this public surface:

interface FixedWorldProtocol<WorldStateHandle> {
  reset(): WorldStateHandle;
  applyOperation(
    state: WorldStateHandle,
    operationDisplayName: string
  ): { success: true; newState: WorldStateHandle } | { success: false; error: string };
  getEntityState(
    state: WorldStateHandle,
    entityDisplayName: string
  ): string;
  toAbstractSnapshot(
    state: WorldStateHandle
  ): Record<string, string>;
}

Preserve this public surface exactly. Internal repository structure and implementation may change.` as const;

export const FIXED_WORLD_PROTOCOL_SPEC_FORBIDDEN_MARKERS = Object.freeze([
  "operationTable",
  "entityFieldTable",
  "ground_truth",
  "hidden_regression_tests",
  "H_G.test",
  "advanceVok",
  "advanceZef",
  "advanceTal",
  "advanceFen",
  "advanceOsk",
  "Vok",
  "Zef",
  "Tal",
  "Fen",
  "Osk",
  "Invariant I",
  "I1",
  "I2",
  "I3",
  "I4",
  "I5",
  "I6",
] as const);
