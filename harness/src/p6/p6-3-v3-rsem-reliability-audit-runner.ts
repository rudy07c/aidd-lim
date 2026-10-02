import { createHash } from "crypto";
import { P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION } from "../context/p6-3-v3-final-static-exposure-selector";
import type { FixedEnvironmentBinding } from "../context/fixed-environment-runtime";
import {
  buildP63V3CellExposure,
} from "./p6-3-v3-calibration-runner";
import {
  initializeP63V3RunStart,
  P6_3_V3_RUN_START_WIRING_VERSION,
  type P63V3RunFixedEnvironmentProvenance,
  type P63V3RunStartDependencies,
} from "./p6-3-v3-run-start";
import { P6_3_V3_RSEM_EXECUTOR_VERSION } from "./p6-3-v3-rsem-executor";
import { P6_3_RSEM_PROTOCOL_PARITY_VERSION } from "./p6-3-rsem-protocol-parity";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
  buildP63V3RSemReliabilityAuditPlan,
  type P63V3RSemReliabilityAuditCell,
} from "./p6-3-v3-rsem-reliability-audit-spec";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION,
  type P63V3RSemReliabilityAuditProbe,
} from "./p6-3-v3-rsem-reliability-audit-executor";

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_RUNNER_VERSION =
  "p6-3-v3-rsem-reliability-audit-runner-v1" as const;
export const P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVENANCE_SCHEMA =
  "p6-3-v3-rsem-reliability-audit-provenance-v1" as const;

export interface P63V3RSemReliabilityAuditProvenance {
  readonly schemaVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVENANCE_SCHEMA;
  readonly runnerVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_RUNNER_VERSION;
  readonly specVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION;
  readonly runClass: "reliability-audit";
  readonly scientificPoolingAllowed: false;
  readonly runStartWiringVersion: typeof P6_3_V3_RUN_START_WIRING_VERSION;
  readonly scientificRSemExecutorVersion: typeof P6_3_V3_RSEM_EXECUTOR_VERSION;
  readonly auditExecutorVersion:
    typeof P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION;
  readonly rsemProtocolParityVersion: typeof P6_3_RSEM_PROTOCOL_PARITY_VERSION;
  readonly finalSelectorVersion:
    typeof P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION;
  readonly fixedEnvironmentIdentity: string;
  readonly planHash: string;
  readonly plannedTrialCount: number;
  readonly candidateCaps: readonly [32000, 64000];
  readonly liveAuthorized: false;
}

export interface P63V3RSemReliabilityAuditPersistence {
  persistRunFixedEnvironmentProvenance(
    provenance: Readonly<P63V3RunFixedEnvironmentProvenance>
  ): void | Promise<void>;
  persistAuditProvenance(
    provenance: Readonly<P63V3RSemReliabilityAuditProvenance>
  ): void | Promise<void>;
}

export interface P63V3PreparedRSemReliabilityAudit {
  readonly plan: readonly P63V3RSemReliabilityAuditCell[];
  readonly planHash: string;
  readonly fixedEnvironment: Readonly<FixedEnvironmentBinding>;
  readonly fixedEnvironmentProvenance:
    Readonly<P63V3RunFixedEnvironmentProvenance>;
  readonly provenance: Readonly<P63V3RSemReliabilityAuditProvenance>;
}

export async function prepareP63V3RSemReliabilityAudit(args: {
  generationZeroRepositoryFiles: Readonly<Record<string, string>>;
  persistence: P63V3RSemReliabilityAuditPersistence;
  runStartDependencies?: P63V3RunStartDependencies;
}): Promise<Readonly<P63V3PreparedRSemReliabilityAudit>> {
  if (P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.liveAuthorization !== false) {
    throw new Error("Rsem reliability audit preparation refuses a live-authorizing freeze");
  }

  const plan = buildP63V3RSemReliabilityAuditPlan();
  const planHash = p63V3RSemReliabilityAuditPlanHash(plan);
  const runStart = await initializeP63V3RunStart({
    generationZeroRepositoryFiles: args.generationZeroRepositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance:
        args.persistence.persistRunFixedEnvironmentProvenance,
    },
    dependencies: args.runStartDependencies,
  });

  const provenance: Readonly<P63V3RSemReliabilityAuditProvenance> =
    Object.freeze({
      schemaVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_PROVENANCE_SCHEMA,
      runnerVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_RUNNER_VERSION,
      specVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_SPEC_VERSION,
      runClass: "reliability-audit",
      scientificPoolingAllowed: false,
      runStartWiringVersion: P6_3_V3_RUN_START_WIRING_VERSION,
      scientificRSemExecutorVersion: P6_3_V3_RSEM_EXECUTOR_VERSION,
      auditExecutorVersion: P6_3_V3_RSEM_RELIABILITY_AUDIT_EXECUTOR_VERSION,
      rsemProtocolParityVersion: P6_3_RSEM_PROTOCOL_PARITY_VERSION,
      finalSelectorVersion: P6_3_V3_FINAL_STATIC_EXPOSURE_POLICY_VERSION,
      fixedEnvironmentIdentity:
        runStart.provenance.fixedEnvironmentIdentity,
      planHash,
      plannedTrialCount: plan.length,
      candidateCaps:
        P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.candidateCaps,
      liveAuthorized: false,
    });
  await args.persistence.persistAuditProvenance(provenance);

  return Object.freeze({
    plan,
    planHash,
    fixedEnvironment: runStart.fixedEnvironment,
    fixedEnvironmentProvenance: runStart.provenance,
    provenance,
  });
}

export function buildP63V3RSemReliabilityAuditExposure(args: {
  cell: Readonly<P63V3RSemReliabilityAuditCell>;
  repositoryFiles: Readonly<Record<string, string>>;
  syntheticWorldDir: string;
  probes: readonly P63V3RSemReliabilityAuditProbe[];
}) {
  return buildP63V3CellExposure({
    cell: {
      sequence: args.cell.sequence,
      measurement: "Rsem",
      taskId: null,
      repeat: args.cell.trial,
      blockKey: args.cell.blockKey,
      armLabel: args.cell.armLabel,
      armKind: args.cell.armKind,
      budgetTokens: args.cell.budgetTokens,
    },
    repositoryFiles: args.repositoryFiles,
    syntheticWorldDir: args.syntheticWorldDir,
    taskById: new Map(),
    probePrompts: args.probes.map((probe) => probe.prompt),
  });
}

export function p63V3RSemReliabilityAuditPlanHash(
  plan: readonly P63V3RSemReliabilityAuditCell[]
): string {
  return createHash("sha256")
    .update(stableJson(plan), "utf8")
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
