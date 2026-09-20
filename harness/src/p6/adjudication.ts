export const P6_2_ADJUDICATION_VERSION = "p6-2-adjudication-v1";

export type P62AdjudicationFinalDisposition =
  | "scientific-failure"
  | "protocol-failure"
  | "infrastructure-invalid";

export interface P62AdjudicationRecord {
  reviewer: string;
  reason: string;
  finalDisposition: P62AdjudicationFinalDisposition;
  adjudicatedAt: string;
  toolVersion: string;
  toolSha256: string;
}

export interface P62AdjudicationRequest {
  measurement: "M" | "Rsem";
  taskId?: string | null;
  repeat: number;
  reviewer: string;
  reason: string;
  finalDisposition: P62AdjudicationFinalDisposition;
  adjudicatedAt?: string;
}

function requireText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must be non-empty`);
  return trimmed;
}

export function applyP62Adjudication(
  result: any,
  request: P62AdjudicationRequest,
  toolSha256: string
): any {
  if (!result || !result.measurements || !Array.isArray(result.auditFlags)) throw new Error("Not a P6-2 AF baseline result");
  if (!Number.isInteger(request.repeat) || request.repeat <= 0) throw new Error("repeat must be a positive integer");
  const reviewer = requireText(request.reviewer, "reviewer");
  const reason = requireText(request.reason, "reason");
  const adjudication: P62AdjudicationRecord = {
    reviewer,
    reason,
    finalDisposition: request.finalDisposition,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(),
    toolVersion: P6_2_ADJUDICATION_VERSION,
    toolSha256,
  };

  let target: any;
  if (request.measurement === "M") {
    const taskId = requireText(request.taskId ?? "", "taskId");
    target = result.measurements.M.repeatResults.find((item: any) => item.taskId === taskId && item.repeat === request.repeat);
    if (!target) throw new Error(`M repeat not found: ${taskId}#${request.repeat}`);
    const raw = target.rawFailureDomain ?? target.failureDomain;
    if (!["system", "infrastructure", "other"].includes(raw)) throw new Error(`M raw failure domain is not adjudicable: ${raw}`);
    if (request.finalDisposition === "protocol-failure") throw new Error("M adjudication does not use protocol-failure final disposition");
    target.rawFailureDomain = raw;
    target.adjudication = adjudication;
    target.passed = false;
    if (request.finalDisposition === "scientific-failure") {
      target.failureDomain = "semantic";
      target.validity = "valid";
    } else {
      target.failureDomain = "infrastructure";
      target.validity = "infrastructure-invalid";
    }
  } else {
    target = result.measurements.Rsem.repeatResults.find((item: any) => item.repeat === request.repeat);
    if (!target) throw new Error(`Rsem repeat not found: ${request.repeat}`);
    const raw = target.rawFailureDomain ?? target.failureDomain;
    if (!["protocol", "system", "infrastructure"].includes(raw)) throw new Error(`Rsem raw failure domain is not adjudicable: ${raw}`);
    target.rawFailureDomain = raw;
    target.adjudication = adjudication;
    if (request.finalDisposition === "scientific-failure") {
      target.failureDomain = "semantic";
      target.validity = "valid";
      target.booleanCorrect = 0;
      target.booleanAccuracy = 0;
      target.protocolValid = true;
    } else if (request.finalDisposition === "protocol-failure") {
      target.failureDomain = "protocol";
      target.validity = "valid";
      target.booleanCorrect = null;
      target.booleanAccuracy = null;
      target.protocolValid = false;
    } else {
      target.failureDomain = "infrastructure";
      target.validity = "infrastructure-invalid";
      target.booleanCorrect = null;
      target.booleanAccuracy = null;
      target.protocolValid = null;
    }
  }

  const flag = result.auditFlags.find((item: any) =>
    item.measurement === request.measurement &&
    item.repeat === request.repeat &&
    (request.measurement === "Rsem" || item.taskId === request.taskId) &&
    !item.resolvedAt
  );
  if (!flag) throw new Error("Matching unresolved audit flag not found");
  flag.resolvedAt = adjudication.adjudicatedAt;
  flag.adjudication = adjudication;
  const unresolved = result.auditFlags.some((item: any) => !item.resolvedAt);
  result.status = unresolved ? "needs-audit" : "running";
  if (!unresolved) result.completedAt = null;
  result.updatedAt = adjudication.adjudicatedAt;
  return result;
}
