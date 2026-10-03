import * as fs from "fs";
import * as path from "path";
import {
  loadP63V3InheritedMEvidence,
} from "./src/p6/p6-3-v3-inherited-m-evidence";

export const P6_3_V3_M_EVALUATOR_BOUNDARY_AUDIT_VERSION =
  "p6-3-v3-m-evaluator-boundary-audit-v1" as const;

export type MFailureAuditClass =
  | "PASS"
  | "A_CANDIDATE_FAILURE_EVIDENCE"
  | "B_FIXED_PROTOCOL_VIOLATION"
  | "C_EVALUATOR_INTERNAL_TYPE_COUPLING"
  | "OTHER_OR_UNRESOLVED";

interface SuiteDigestLike {
  passed: boolean | null;
  numPassed: number | null;
  numFailed: number | null;
  executionError: string | null;
  failedCases: Array<{ testName: string | null; error: string | null }>;
}

interface ArtifactView {
  result: Record<string, unknown>;
  agent: Record<string, unknown>;
}

export interface MFailureAuditRow {
  sequence: number;
  taskId: string;
  repeat: number;
  armLabel: string;
  budgetTokens: number | "full";
  originalPassed: boolean;
  originalFailureDomain: string;
  originalFailureCategory: string | null;
  originalProtocolContractViolated: boolean | null;
  classification: MFailureAuditClass;
  evidence: {
    visiblePassed: boolean | null;
    hiddenPassed: boolean | null;
    taskSpecificPassed: boolean | null;
    hiddenSuiteFailedToRun: boolean;
    hiddenHGTypeCouplingSignature: boolean;
    protocolAdapterGenericOmissionEvidence: boolean;
    repositoryErrorLocationEvidence: boolean;
  };
  artifactPath: string;
}

export interface MFailureBoundaryAuditReport {
  schemaVersion: typeof P6_3_V3_M_EVALUATOR_BOUNDARY_AUDIT_VERSION;
  analysisClass: "post-hoc-design-audit-sensitivity";
  primaryEvidenceMutated: false;
  providerCallsMade: false;
  source: {
    statePath: string;
    stateSha256: string;
    checkoutGitSha: string;
    planHash: string;
    treatmentProvenanceHash: string;
    fixedEnvironmentIdentity: string;
    mEvidenceSemanticSha256: string;
    expectedMLogicalCells: 792;
  };
  definitions: Record<MFailureAuditClass, string>;
  totals: Record<MFailureAuditClass, number>;
  byArm: Record<string, Record<MFailureAuditClass, number>>;
  byTask: Record<string, Record<MFailureAuditClass, number>>;
  rows: MFailureAuditRow[];
}

const CLASSES: readonly MFailureAuditClass[] = [
  "PASS",
  "A_CANDIDATE_FAILURE_EVIDENCE",
  "B_FIXED_PROTOCOL_VIOLATION",
  "C_EVALUATOR_INTERNAL_TYPE_COUPLING",
  "OTHER_OR_UNRESOLVED",
];

export function classifyMArtifactForBoundaryAudit(args: {
  row: {
    sequence: number;
    taskId: string | null;
    repeat: number;
    armLabel: string;
    budgetTokens: number | "full";
    passed: boolean | null;
    effectiveFailureDomain: string;
  };
  artifact: unknown;
  artifactPath: string;
}): MFailureAuditRow {
  const artifact = asRecord(args.artifact, "artifact");
  const result = asRecord(artifact.result, "artifact.result");
  const agent = asRecord(artifact.agent, "artifact.agent");
  const taskId = args.row.taskId;
  if (!taskId) throw new Error(`M sequence ${args.row.sequence} has null taskId`);
  if (typeof args.row.passed !== "boolean") {
    throw new Error(`M sequence ${args.row.sequence} has non-boolean passed`);
  }

  const visible = readSuite(result.visible);
  const hidden = readSuite(result.hidden);
  const taskSpecific = readSuite(result.taskSpecific);
  const failureCategory = nullableString(result.failureCategory);
  const protocolContractViolated = nullableBoolean(result.protocolContractViolated);
  const executionStatus = nullableString(result.executionStatus);
  const validity = nullableString(result.validity);
  const failureText = [
    nullableString(result.failureReason) ?? "",
    ...hidden.failedCases.map((entry) => entry.error ?? ""),
  ].join("\n");

  const hiddenSuiteFailedToRun =
    hidden.passed === false &&
    /Test suite failed to run/.test(failureText);

  const hiddenHGTypeCouplingSignature =
    hiddenSuiteFailedToRun &&
    /hidden_regression_tests[\\/]H_G\.test\.ts/.test(failureText) &&
    /TS(?:2322|2345)/.test(failureText) &&
    /unknown/.test(failureText) &&
    /WorldState/.test(failureText);

  const modifiedFiles = asOptionalRecord(agent.modifiedFiles);
  const protocolAdapter =
    typeof modifiedFiles?.["src/protocol_adapter.ts"] === "string"
      ? String(modifiedFiles["src/protocol_adapter.ts"])
      : "";
  const protocolAdapterGenericOmissionEvidence =
    /export\s+const\s+protocol\s*:\s*WorldProtocol(?!\s*<)/.test(protocolAdapter) ||
    /\)\s*:\s*OperationResult(?!\s*<)/.test(protocolAdapter);

  const repositoryErrorLocationEvidence =
    /repository[\\/](?:src|tests)[\\/]/.test(failureText);

  let classification: MFailureAuditClass;
  if (args.row.passed) {
    classification = "PASS";
  } else if (
    executionStatus === "ok" &&
    validity === "valid" &&
    visible.passed === true &&
    taskSpecific.passed === true &&
    hidden.passed === false &&
    hiddenHGTypeCouplingSignature
  ) {
    // Narrow post-hoc C signature: the model-produced candidate passed the
    // visible + task-specific evaluators, while H(G) alone failed to compile
    // because its concrete WorldState annotation collided with an opaque/unknown
    // protocol state handle. This does not rewrite the frozen primary M score.
    classification = "C_EVALUATOR_INTERNAL_TYPE_COUPLING";
  } else if (
    protocolContractViolated === true ||
    failureCategory === "protocol-contract"
  ) {
    classification = "B_FIXED_PROTOCOL_VIOLATION";
  } else if (
    executionStatus === "ok" &&
    validity === "valid" &&
    (
      visible.passed === false ||
      taskSpecific.passed === false ||
      hidden.failedCases.some((entry) => !String(entry.testName ?? "").startsWith("[suite]")) ||
      repositoryErrorLocationEvidence
    )
  ) {
    classification = "A_CANDIDATE_FAILURE_EVIDENCE";
  } else {
    // Includes structured-output parse failures, mutation validation failures,
    // and scoring failures that cannot be attributed safely from committed
    // evidence alone. Do not force these into A/B/C.
    classification = "OTHER_OR_UNRESOLVED";
  }

  return {
    sequence: args.row.sequence,
    taskId,
    repeat: args.row.repeat,
    armLabel: args.row.armLabel,
    budgetTokens: args.row.budgetTokens,
    originalPassed: args.row.passed,
    originalFailureDomain: args.row.effectiveFailureDomain,
    originalFailureCategory: failureCategory,
    originalProtocolContractViolated: protocolContractViolated,
    classification,
    evidence: {
      visiblePassed: visible.passed,
      hiddenPassed: hidden.passed,
      taskSpecificPassed: taskSpecific.passed,
      hiddenSuiteFailedToRun,
      hiddenHGTypeCouplingSignature,
      protocolAdapterGenericOmissionEvidence,
      repositoryErrorLocationEvidence,
    },
    artifactPath: args.artifactPath,
  };
}

export function buildMFailureBoundaryAuditReport(repoRoot: string): MFailureBoundaryAuditReport {
  const inherited = loadP63V3InheritedMEvidence(repoRoot);
  if (inherited.rows.length !== 792) {
    throw new Error(`Expected 792 inherited M rows, got ${inherited.rows.length}`);
  }

  const rows = inherited.rows.map((row) => {
    if (!row.artifactPath) {
      throw new Error(`M sequence ${row.sequence} is missing artifactPath`);
    }
    const artifactPath = resolveRepoContainedPath(repoRoot, row.artifactPath);
    const bytes = fs.readFileSync(artifactPath, "utf8");
    const artifact = JSON.parse(bytes) as unknown;
    return classifyMArtifactForBoundaryAudit({
      row: {
        sequence: row.sequence,
        taskId: row.taskId,
        repeat: row.repeat,
        armLabel: row.armLabel,
        budgetTokens: row.budgetTokens,
        passed: row.passed,
        effectiveFailureDomain: row.effectiveFailureDomain,
      },
      artifact,
      artifactPath: row.artifactPath,
    });
  });

  const totals = emptyCounts();
  const byArm: Record<string, Record<MFailureAuditClass, number>> = {};
  const byTask: Record<string, Record<MFailureAuditClass, number>> = {};
  for (const row of rows) {
    totals[row.classification] += 1;
    const arm = byArm[row.armLabel] ??= emptyCounts();
    arm[row.classification] += 1;
    const task = byTask[row.taskId] ??= emptyCounts();
    task[row.classification] += 1;
  }

  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  if (total !== 792) throw new Error(`Audit classification total drift: ${total}`);

  return {
    schemaVersion: P6_3_V3_M_EVALUATOR_BOUNDARY_AUDIT_VERSION,
    analysisClass: "post-hoc-design-audit-sensitivity",
    primaryEvidenceMutated: false,
    providerCallsMade: false,
    source: {
      statePath: inherited.sourceStatePath,
      stateSha256: inherited.sourceStateSha256,
      checkoutGitSha: inherited.sourceCheckoutGitSha,
      planHash: inherited.sourcePlanHash,
      treatmentProvenanceHash: inherited.sourceTreatmentProvenanceHash,
      fixedEnvironmentIdentity: inherited.fixedEnvironmentIdentity,
      mEvidenceSemanticSha256: inherited.mEvidenceSemanticSha256,
      expectedMLogicalCells: 792,
    },
    definitions: {
      PASS: "Frozen primary M outcome passed.",
      A_CANDIDATE_FAILURE_EVIDENCE:
        "Valid scoring attempt with evidence of candidate-side behavioral/type/test failure; excludes the narrow evaluator-coupling signature.",
      B_FIXED_PROTOCOL_VIOLATION:
        "Frozen scorer explicitly marked protocolContractViolated=true or failureCategory=protocol-contract.",
      C_EVALUATOR_INTERNAL_TYPE_COUPLING:
        "Visible and task-specific suites passed, while hidden H(G) failed to compile with TS2322/TS2345 unknown↔WorldState coupling. Post-hoc diagnostic only.",
      OTHER_OR_UNRESOLVED:
        "Failure cannot be safely forced into A/B/C from committed evidence alone (for example output parse or mutation validation failures).",
    },
    totals,
    byArm: sortRecord(byArm),
    byTask: sortRecord(byTask),
    rows,
  };
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const report = buildMFailureBoundaryAuditReport(repoRoot);
  const outArg = readArg("--out");
  if (outArg) {
    const outPath = path.resolve(process.cwd(), outArg);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  const cGenericOmission = report.rows.filter(
    (row) =>
      row.classification === "C_EVALUATOR_INTERNAL_TYPE_COUPLING" &&
      row.evidence.protocolAdapterGenericOmissionEvidence
  ).length;
  const summary = {
    schemaVersion: report.schemaVersion,
    analysisClass: report.analysisClass,
    primaryEvidenceMutated: report.primaryEvidenceMutated,
    providerCallsMade: report.providerCallsMade,
    sourceMLogicalCells: report.source.expectedMLogicalCells,
    totals: report.totals,
    byArm: report.byArm,
    evaluatorCouplingWithGenericOmissionEvidence: cGenericOmission,
    reportWrittenTo: outArg ? path.resolve(process.cwd(), outArg) : null,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}

function readSuite(value: unknown): SuiteDigestLike {
  if (value === null || value === undefined) {
    return {
      passed: null,
      numPassed: null,
      numFailed: null,
      executionError: null,
      failedCases: [],
    };
  }
  const record = asRecord(value, "suite");
  const failedCases = Array.isArray(record.failedCases)
    ? record.failedCases.map((item) => {
        const entry = asRecord(item, "suite.failedCases[]");
        return {
          testName: nullableString(entry.testName),
          error: nullableString(entry.error),
        };
      })
    : [];
  return {
    passed: nullableBoolean(record.passed),
    numPassed: nullableNumber(record.numPassed),
    numFailed: nullableNumber(record.numFailed),
    executionError: nullableString(record.executionError),
    failedCases,
  };
}

function resolveRepoContainedPath(repoRoot: string, relativePath: string): string {
  const root = fs.realpathSync(repoRoot);
  const candidate = path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (!candidate.startsWith(prefix)) {
    throw new Error(`Artifact path escaped repository root: ${relativePath}`);
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    throw new Error(`Artifact file missing: ${relativePath}`);
  }
  const real = fs.realpathSync(candidate);
  if (!real.startsWith(prefix)) {
    throw new Error(`Artifact realpath escaped repository root: ${relativePath}`);
  }
  return real;
}

function emptyCounts(): Record<MFailureAuditClass, number> {
  return {
    PASS: 0,
    A_CANDIDATE_FAILURE_EVIDENCE: 0,
    B_FIXED_PROTOCOL_VIOLATION: 0,
    C_EVALUATOR_INTERNAL_TYPE_COUPLING: 0,
    OTHER_OR_UNRESOLVED: 0,
  };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function asRecord(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, any>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

if (require.main === module) {
  main();
}
