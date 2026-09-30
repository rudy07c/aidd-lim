import type { P63CellOutcome } from "./p6-3-live-calibration-runner";

export type P63V3ScientificValidity = "valid" | "infrastructure-invalid";

/**
 * Recover the already-frozen scientific validity carried by the v3 executor
 * artifact and require any diagnostic copy to agree with it.
 *
 * Historical P6-3/P6-2 `P63CellOutcome` did not expose validity as a first-class
 * field. The v3 M and Rsem executors nevertheless persist their exact classified
 * result under `artifactPayload.result`, including `validity`. This bridge makes
 * that independent axis explicit at the v3 controller boundary without changing
 * historical executor/failure-domain semantics.
 *
 * Two historical combinations are unambiguous even when a legacy offline mock
 * omits the explicit field: `infrastructure` is necessarily
 * `infrastructure-invalid`, and `executionStatus=ok` + `failureDomain=none` is
 * necessarily `valid`. Ambiguous semantic/protocol/system/other outcomes remain
 * fail-closed unless explicit validity is present.
 */
export function requireP63V3ScientificValidity(
  outcome: Readonly<P63CellOutcome>
): P63V3ScientificValidity {
  const diagnostic = normalizeValidity(outcome.diagnosticSummary.validity);
  const artifact = outcome.artifactPayload;
  const artifactValidity =
    artifact && typeof artifact === "object"
      ? normalizeValidity(
          (artifact as { result?: { validity?: unknown } }).result?.validity
        )
      : null;

  if (diagnostic !== null && artifactValidity !== null && diagnostic !== artifactValidity) {
    throw new Error(
      `P6-3 v3 scientific validity mismatch between diagnostic and artifact result: ${diagnostic} != ${artifactValidity}`
    );
  }
  const explicitValidity = diagnostic ?? artifactValidity;
  if (explicitValidity !== null) return explicitValidity;

  if (outcome.failureDomain === "infrastructure") {
    return "infrastructure-invalid";
  }
  if (outcome.failureDomain === "none" && outcome.executionStatus === "ok") {
    return "valid";
  }

  throw new Error(
    `P6-3 v3 outcome is missing scientific validity for ambiguous failure semantics: executionStatus=${outcome.executionStatus}, failureDomain=${outcome.failureDomain}`
  );
}

function normalizeValidity(value: unknown): P63V3ScientificValidity | null {
  return value === "valid" || value === "infrastructure-invalid" ? value : null;
}
