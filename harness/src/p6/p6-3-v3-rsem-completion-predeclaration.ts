import {
  P6_3_RSEM_PROVIDER_CONTRACT,
} from "./p6-3-rsem-protocol-parity";
import {
  P6_3_V3_CALIBRATION_PREDECLARATION,
  P6_3_V3_ARTIFACT_BUDGETS,
} from "./p6-3-v3-calibration-predeclaration";

export const P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION =
  "p6-3-v3-rsem-completion-predeclaration-v1" as const;

export const P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH =
  "docs/findings/evidence/p6-3-v3-live-diagnostic-stop/state.json" as const;
export const P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256 =
  "13efea9b8cc00598e5341595344f125f2c1b6b08feef22384098be19a092b627" as const;
export const P6_3_V3_RSEM_COMPLETION_SOURCE_CHECKOUT_SHA =
  "c6b078dae6a9f8536b9dd283e06ccb4384850d47" as const;
export const P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH =
  "9d3a3f92d6e169e10600e3caa01fecaed7efb7ee8383e9700abe24bb19b8b932" as const;
export const P6_3_V3_RSEM_COMPLETION_SOURCE_TREATMENT_PROVENANCE_HASH =
  "bd66dc16fde82faad539778a51652061656b752f67bc8f929e42b9fbadc62d11" as const;
export const P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY =
  "world-protocol-surface-v1:9f8d38e1bb47b4cdd2d5f017e2df05551cf13e0b60a4e4a3c922e07ecfd3bb47:p6-3-v3-world-protocol-external-spec-v1:d1dda51bdaf12a86f3df7e174460f355b518f960062f4d68a8e0e56aa8ef921b:d1dda51bdaf12a86f3df7e174460f355b518f960062f4d68a8e0e56aa8ef921b" as const;

export const P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS = 792 as const;
export const P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS = 72 as const;
export const P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS = 864 as const;
export const P6_3_V3_RSEM_COMPLETION_MAX_SCIENTIFIC_ATTEMPTS_PER_CELL = 3 as const;

export const P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT = Object.freeze({
  model: P6_3_RSEM_PROVIDER_CONTRACT.model,
  reasoningEffort: P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort,
  maxOutputTokens: 32000,
  requestTimeoutMs: P6_3_RSEM_PROVIDER_CONTRACT.requestTimeoutMs,
  providerMaxRetries: P6_3_RSEM_PROVIDER_CONTRACT.providerMaxRetries,
  serviceTier: P6_3_RSEM_PROVIDER_CONTRACT.serviceTier,
  promptCacheMode: P6_3_RSEM_PROVIDER_CONTRACT.promptCacheMode,
  storeResponses: P6_3_RSEM_PROVIDER_CONTRACT.storeResponses,
  executionMode: P6_3_RSEM_PROVIDER_CONTRACT.executionMode,
} as const);

export const P6_3_V3_RSEM_COMPLETION_PREDECLARATION = Object.freeze({
  version: P6_3_V3_RSEM_COMPLETION_PREDECLARATION_VERSION,
  runClass: "scientific-calibration-completion",
  calibrationOnly: true,
  confirmatoryStage1AEligible: false,
  purpose: "complete-p6-3-v3-co-gate-with-inherited-M-and-fresh-Rsem",
  treatmentVersion:
    P6_3_V3_CALIBRATION_PREDECLARATION.version,
  contextDefinition:
    P6_3_V3_CALIBRATION_PREDECLARATION.contextDefinition,
  artifactBudgets: P6_3_V3_ARTIFACT_BUDGETS,
  inheritedM: Object.freeze({
    sourceStatePath: P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_PATH,
    sourceStateSha256: P6_3_V3_RSEM_COMPLETION_SOURCE_STATE_SHA256,
    sourceCheckoutGitSha: P6_3_V3_RSEM_COMPLETION_SOURCE_CHECKOUT_SHA,
    sourcePlanHash: P6_3_V3_RSEM_COMPLETION_SOURCE_PLAN_HASH,
    sourceTreatmentProvenanceHash:
      P6_3_V3_RSEM_COMPLETION_SOURCE_TREATMENT_PROVENANCE_HASH,
    fixedEnvironmentIdentity:
      P6_3_V3_RSEM_COMPLETION_FIXED_ENVIRONMENT_IDENTITY,
    expectedLogicalCells:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
    requiredMeasurement: "M",
    requiredSequenceRange: Object.freeze([0, 791] as const),
    requireExactlyOneValidObservationPerSequence: true,
    requireNoInfrastructureInvalidMAttempts: true,
    scientificOutcomeUse: "primary-M-endpoint",
  }),
  freshRSem: Object.freeze({
    expectedLogicalCells:
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
    repeatCount:
      P6_3_V3_CALIBRATION_PREDECLARATION.execution.repeatCount,
    armLabels:
      P6_3_V3_CALIBRATION_PREDECLARATION.execution.armLabels,
    namingSchemeId:
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.namingSchemeId,
    booleanProbeCount:
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.booleanProbeCount,
    aggregate:
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.aggregate,
    provider: P6_3_V3_RSEM_COMPLETION_PROVIDER_CONTRACT,
    maxScientificAttemptsPerLogicalCell:
      P6_3_V3_RSEM_COMPLETION_MAX_SCIENTIFIC_ATTEMPTS_PER_CELL,
    fixedEnvironmentIdentityMustEqualInheritedSource: true,
    oldStoppedRunRsemObservationReuseAllowed: false,
    reliabilityAuditObservationPoolingAllowed: false,
  }),
  combinedAnalysis: Object.freeze({
    expectedLogicalCells:
      P6_3_V3_RSEM_COMPLETION_COMBINED_LOGICAL_CELLS,
    mLogicalCells:
      P6_3_V3_RSEM_COMPLETION_INHERITED_M_LOGICAL_CELLS,
    rsemLogicalCells:
      P6_3_V3_RSEM_COMPLETION_FRESH_RSEM_LOGICAL_CELLS,
    selectionRule:
      P6_3_V3_CALIBRATION_PREDECLARATION.selection.rule,
    deltaM:
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.M.margin,
    deltaR:
      P6_3_V3_CALIBRATION_PREDECLARATION.measurements.Rsem.margin,
    tieBreak:
      P6_3_V3_CALIBRATION_PREDECLARATION.selection.multipleQualifiersTieBreak,
    historicalV2PrimaryEstimatePooling: false,
    stoppedV3RsemPooling: false,
    reliabilityAuditPooling: false,
  }),
  reliabilityQualification: Object.freeze({
    findingPath:
      "docs/findings/p6_3_v3_rsem_reliability_audit.md",
    qualifiedMaxOutputTokens: 32000,
    qualifiedValidTrials: 60,
    capCensoringCount: 0,
    nonCapInfrastructureAttemptCount: 0,
    protocolInvalidAttemptCount: 0,
    interruptedAttempts: 0,
    externalArchiveFile:
      "p6-3-v3-rsem-reliability-audit-2026-10-03T00-35-14-051Z.tar.gz",
    externalArchiveSha256:
      "15871172b675d6079909cee15ea2e226759a6a9ba7950a123dbbea44f5dc4817",
  }),
  liveAuthorization: false,
} as const);
