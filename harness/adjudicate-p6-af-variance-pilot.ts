import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { P62VariancePilotResult, PilotEvent } from "./p6-af-variance-pilot-live";
import { P6_2_VARIANCE_ADJUDICATION_VERSION } from "./p6-af-variance-pilot-live";

export type VarianceFinalDisposition = "scientific-failure" | "protocol-failure" | "infrastructure-invalid";
export interface VarianceAdjudicationRequest { auditId: string; reviewer: string; reason: string; finalDisposition: VarianceFinalDisposition; adjudicatedAt?: string; }
export interface VarianceAdjudicationRecord { reviewer: string; reason: string; finalDisposition: VarianceFinalDisposition; adjudicatedAt: string; toolVersion: string; toolSha256: string; }

function text(value: string, name: string): string { const x = value.trim(); if (!x) throw new Error(`${name} must be non-empty`); return x; }
function findEvent(result: P62VariancePilotResult, flag: P62VariancePilotResult["auditFlags"][number]): PilotEvent {
  const attempt = result.attempts.find((a) => a.pairId === flag.pairId && a.attempt === flag.attempt); if (!attempt) throw new Error("audit attempt not found");
  const event = attempt.events.find((e) => e.kind === flag.measurement && e.arm === flag.arm && (e.kind !== "M" || e.taskId === flag.taskId)); if (!event) throw new Error("audit event not found"); return event;
}
export function applyVariancePilotAdjudication(result: P62VariancePilotResult, request: VarianceAdjudicationRequest, toolSha256: string): P62VariancePilotResult {
  const flag = result.auditFlags.find((f) => f.auditId === request.auditId && !f.resolvedAt); if (!flag) throw new Error(`unresolved audit flag not found: ${request.auditId}`);
  if (flag.kind === "statistical-design") throw new Error("statistical-design audit cannot be resolved by execution adjudication; redesign/freeze decision is required");
  const record: VarianceAdjudicationRecord = { reviewer: text(request.reviewer, "reviewer"), reason: text(request.reason, "reason"), finalDisposition: request.finalDisposition,
    adjudicatedAt: request.adjudicatedAt ?? new Date().toISOString(), toolVersion: P6_2_VARIANCE_ADJUDICATION_VERSION, toolSha256 };
  const event = findEvent(result, flag), attempt = result.attempts.find((a) => a.pairId === flag.pairId && a.attempt === flag.attempt)!;
  const raw = (event.result as any).rawFailureDomain ?? (event.result as any).failureDomain; (event.result as any).rawFailureDomain = raw; (event.result as any).adjudication = record;
  if (event.kind === "M") {
    if (!["system", "other", "infrastructure"].includes(raw)) throw new Error(`M variance event not adjudicable: ${raw}`);
    if (request.finalDisposition === "protocol-failure") throw new Error("M variance adjudication cannot end as protocol-failure");
    event.result.passed = false;
    if (request.finalDisposition === "scientific-failure") { event.result.failureDomain = "semantic"; event.result.validity = "valid"; attempt.status = "running"; attempt.reason = null; }
    else { event.result.failureDomain = "infrastructure"; event.result.validity = "infrastructure-invalid"; attempt.status = "replace-infrastructure"; attempt.reason = `adjudicated infrastructure:${event.taskId}:${event.arm}`; }
  } else {
    if (!["protocol", "system", "infrastructure"].includes(raw)) throw new Error(`Rsem variance event not adjudicable: ${raw}`);
    if (request.finalDisposition === "scientific-failure") { event.result.failureDomain = "semantic"; event.result.validity = "valid"; event.result.protocolValid = true; event.result.booleanCorrect = 0; event.result.booleanAccuracy = 0; attempt.status = "running"; attempt.reason = null; }
    else if (request.finalDisposition === "infrastructure-invalid") { event.result.failureDomain = "infrastructure"; event.result.validity = "infrastructure-invalid"; event.result.protocolValid = null; event.result.booleanCorrect = null; event.result.booleanAccuracy = null; attempt.status = "replace-infrastructure"; attempt.reason = `adjudicated infrastructure:Rsem:${event.arm}`; }
    else { event.result.failureDomain = "protocol"; event.result.validity = "valid"; event.result.protocolValid = false; event.result.booleanCorrect = null; event.result.booleanAccuracy = null; attempt.status = "needs-audit"; attempt.reason = `adjudicated protocol:Rsem:${event.arm}`; }
  }
  flag.resolvedAt = record.adjudicatedAt; flag.resolution = record;
  const unresolvedExecution = result.auditFlags.some((f) => f.kind === "execution" && !f.resolvedAt);
  result.status = unresolvedExecution || attempt.status === "needs-audit" ? "execution-needs-audit" : "running"; result.completedAt = null; result.updatedAt = record.adjudicatedAt; return result;
}

function arg(name: string): string { const key = `--${name}`; const i = process.argv.indexOf(key); if (i < 0 || !process.argv[i + 1]) throw new Error(`${key} is required`); return process.argv[i + 1]; }
function main(): void {
  const file = path.resolve(arg("result")), source = fs.readFileSync(__filename), toolSha = crypto.createHash("sha256").update(source).digest("hex");
  const result = JSON.parse(fs.readFileSync(file, "utf8")) as P62VariancePilotResult;
  applyVariancePilotAdjudication(result, { auditId: arg("audit-id"), reviewer: arg("reviewer"), reason: arg("reason"), finalDisposition: arg("disposition") as VarianceFinalDisposition }, toolSha);
  const tmp = `${file}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n"); fs.renameSync(tmp, file); console.log(`updated ${file}: status=${result.status}`);
}
if (require.main === module) { try { main(); } catch (e) { console.error("variance adjudication failed:", e); process.exit(1); } }
