import * as fs from "fs";
import * as path from "path";
import {
  EntityId,
  GroundTruth,
  NamingScheme,
  StateId,
  stateNameKey,
} from "../../synthetic-world/schema";
import { GeneratedProbe, generateProbes } from "./probe-generator";
import { scoreProbe } from "./probe-scorer";

export interface Stage1ProbeAudit {
  total: number;
  booleanTotal: number;
  booleanTrue: number;
  booleanFalse: number;
  matchedNegativeCount: number;
  alwaysTrueAccuracy: number;
  alwaysFalseAccuracy: number;
  f5Warnings: string[];
  rawGroundTruthIdLeakage: string[];
}

function eName(scheme: NamingScheme, entityId: EntityId): string {
  return scheme.entityNames[entityId] ?? entityId;
}

function sName(scheme: NamingScheme, entityId: EntityId, stateId: StateId): string {
  return scheme.stateNames[stateNameKey(entityId, stateId)] ?? stateId;
}

/**
 * Build the Stage 1 bank without mutating Stage 0.5's historical generator/fixture.
 * The old generator's positive boolean probes are retained, and each receives a
 * mechanically matched negative probe grounded in the same invariant.
 */
export function generateStage1Probes(
  groundTruth: GroundTruth,
  scheme: NamingScheme,
  visibleTestPath?: string
): GeneratedProbe[] {
  const legacySafe = generateProbes(groundTruth, scheme, visibleTestPath).filter((p) => !p.f5Warning);
  const result: GeneratedProbe[] = [...legacySafe];
  const invariantById = new Map(groundTruth.invariants.map((inv) => [inv.id, inv]));

  for (const positive of legacySafe.filter((p) => p.type === "boolean" && p.correctAnswer === true)) {
    const invariantId = String(positive.derivedFrom.invariantId ?? "");
    const inv = invariantById.get(invariantId);
    if (!inv) throw new Error(`Stage 1 probe ${positive.probeId} references unknown invariant ${invariantId}`);

    const condEntity = eName(scheme, inv.condition.entity);
    const condState = sName(scheme, inv.condition.entity, inv.condition.state);
    const reqEntity = eName(scheme, inv.requires.entity);
    const reqState = sName(scheme, inv.requires.entity, inv.requires.state);
    const kind = String(positive.derivedFrom.kind ?? "");

    if (kind === "invariant_violation_check") {
      result.push({
        probeId: `${positive.probeId}-matched-negative`,
        type: "boolean",
        namingScheme: scheme.schemeId,
        prompt: `${condEntity} が '${condState}' で、${reqEntity} が '${reqState}' である状態は、この世界のinvariantに違反するか？`,
        correctAnswer: false,
        derivedFrom: {
          kind: "invariant_violation_check_matched_negative",
          invariantId: inv.id,
          encoding: inv.encoding,
          matchedPositiveProbeId: positive.probeId,
        },
        note: "Stage 1 matched negative: condition側は同じままrequiresを満たす状態に反転。",
      });
      continue;
    }

    if (kind === "invariant_stress_reasoning") {
      result.push({
        probeId: `${positive.probeId}-matched-negative`,
        type: "boolean",
        namingScheme: scheme.schemeId,
        prompt: `もし新しいoperationが追加され、${reqEntity} が '${reqState}' である場合に限って ${condEntity} を '${condState}' へ遷移させられる場合、このoperationは ${condEntity} と ${reqEntity} のこのinvariantに違反する状態を新たに作るか？`,
        correctAnswer: false,
        derivedFrom: {
          kind: "invariant_stress_reasoning_matched_negative",
          invariantId: inv.id,
          encoding: inv.encoding,
          matchedPositiveProbeId: positive.probeId,
        },
        note: "Stage 1 matched negative: positive probeで欠落していたrequires guardを満たすよう反転。",
      });
      continue;
    }

    throw new Error(`Unsupported Stage 1 boolean probe kind: ${kind}`);
  }

  return result;
}

export function auditStage1ProbeBank(probes: GeneratedProbe[]): Stage1ProbeAudit {
  const booleanProbes = probes.filter((p) => p.type === "boolean");
  const booleanTrue = booleanProbes.filter((p) => p.correctAnswer === true).length;
  const booleanFalse = booleanProbes.filter((p) => p.correctAnswer === false).length;
  const matchedNegativeCount = booleanProbes.filter(
    (p) => typeof p.derivedFrom.matchedPositiveProbeId === "string"
  ).length;

  const alwaysTrueCorrect = booleanProbes.filter((p) => scoreProbe(p, "true").correct).length;
  const alwaysFalseCorrect = booleanProbes.filter((p) => scoreProbe(p, "false").correct).length;
  const denominator = booleanProbes.length || 1;
  const f5Warnings = probes.filter((p) => p.f5Warning).map((p) => p.probeId);
  const rawGroundTruthIdLeakage = probes
    .filter((p) => /\b(?:E|O|I)\d+\b/.test(p.prompt))
    .map((p) => p.probeId);

  return {
    total: probes.length,
    booleanTotal: booleanProbes.length,
    booleanTrue,
    booleanFalse,
    matchedNegativeCount,
    alwaysTrueAccuracy: alwaysTrueCorrect / denominator,
    alwaysFalseAccuracy: alwaysFalseCorrect / denominator,
    f5Warnings,
    rawGroundTruthIdLeakage,
  };
}

export function assertStage1ProbeBankValid(probes: GeneratedProbe[]): Stage1ProbeAudit {
  const audit = auditStage1ProbeBank(probes);
  if (audit.booleanTotal === 0) throw new Error("Stage 1 probe bank must contain boolean probes");
  if (audit.booleanTrue !== audit.booleanFalse) {
    throw new Error(`Stage 1 boolean labels are imbalanced: true=${audit.booleanTrue}, false=${audit.booleanFalse}`);
  }
  if (audit.matchedNegativeCount !== audit.booleanFalse) {
    throw new Error(`Every Stage 1 negative boolean probe must be explicitly matched: matched=${audit.matchedNegativeCount}, false=${audit.booleanFalse}`);
  }
  if (audit.alwaysTrueAccuracy > 0.5 || audit.alwaysFalseAccuracy > 0.5) {
    throw new Error(
      `Constant-answer baseline too strong: alwaysTrue=${audit.alwaysTrueAccuracy}, alwaysFalse=${audit.alwaysFalseAccuracy}`
    );
  }
  if (audit.f5Warnings.length > 0) {
    throw new Error(`Stage 1 probe bank contains F5 leakage warnings: ${audit.f5Warnings.join(", ")}`);
  }
  if (audit.rawGroundTruthIdLeakage.length > 0) {
    throw new Error(`Stage 1 prompts leak raw ground-truth ids: ${audit.rawGroundTruthIdLeakage.join(", ")}`);
  }
  return audit;
}

if (require.main === module) {
  const swDir = path.join(__dirname, "../../synthetic-world");
  const groundTruth: GroundTruth = JSON.parse(
    fs.readFileSync(path.join(swDir, "ground_truth.json"), "utf8")
  );
  const schemes: NamingScheme[] = JSON.parse(
    fs.readFileSync(path.join(swDir, "naming_schemes.json"), "utf8")
  );
  const scheme = schemes.find((candidate) => candidate.schemeId === "A-obfuscated");
  if (!scheme) throw new Error("A-obfuscated naming scheme not found");

  const visibleTestPath = path.join(swDir, "repository/tests/rules.visible.test.ts");
  const probes = generateStage1Probes(groundTruth, scheme, visibleTestPath);
  const audit = assertStage1ProbeBankValid(probes);
  const outputPath = path.join(__dirname, "../fixtures/probe-bank-stage1.json");
  fs.writeFileSync(outputPath, JSON.stringify(probes, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ outputPath, audit }, null, 2));
}
