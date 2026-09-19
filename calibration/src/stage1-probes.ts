import * as crypto from "crypto";
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

/** Must match the current calibration runner batching when auditing positional balance. */
export const STAGE1_PROBE_BATCH_SIZE = 20;
export const STAGE1_BOOLEAN_DESIGN_VERSION = "stage1-neutral-relation-v2";

export interface Stage1ProbeBatchAudit {
  batchIndex: number;
  booleanTrue: number;
  booleanFalse: number;
}

export interface Stage1ProbeAudit {
  total: number;
  booleanTotal: number;
  booleanTrue: number;
  booleanFalse: number;
  counterexampleNegativeCount: number;
  surfaceNeutralBooleanCount: number;
  alwaysTrueAccuracy: number;
  alwaysFalseAccuracy: number;
  batchBooleanBalance: Stage1ProbeBatchAudit[];
  f5Warnings: string[];
  rawGroundTruthIdLeakage: string[];
  booleanCueWarnings: string[];
  duplicateBooleanPrompts: string[];
}

type RelationEndpoint = { entity: EntityId; state: StateId };
type ReachableState = Record<string, StateId>;

function eName(scheme: NamingScheme, entityId: EntityId): string {
  return scheme.entityNames[entityId] ?? entityId;
}

function sName(scheme: NamingScheme, entityId: EntityId, stateId: StateId): string {
  return scheme.stateNames[stateNameKey(entityId, stateId)] ?? stateId;
}

function stateKey(groundTruth: GroundTruth, state: ReachableState): string {
  return groundTruth.entities.map((entity) => `${entity.id}:${state[entity.id]}`).join("|");
}

/** Enumerate the finite abstract state graph so false relation probes have real counterexamples. */
function enumerateReachableStates(groundTruth: GroundTruth): ReachableState[] {
  const initial: ReachableState = {};
  for (const entity of groundTruth.entities) initial[entity.id] = entity.initialState;

  const seen = new Map<string, ReachableState>();
  const queue: ReachableState[] = [initial];
  seen.set(stateKey(groundTruth, initial), initial);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const transition of groundTruth.transitions) {
      const effectsReady = transition.effects.every(
        (effect) => current[effect.entity] === effect.fromState
      );
      const preconditionsReady = transition.preconditions.every(
        (precondition) => current[precondition.entity] === precondition.state
      );
      if (!effectsReady || !preconditionsReady) continue;

      const next: ReachableState = { ...current };
      for (const effect of transition.effects) next[effect.entity] = effect.toState;
      const key = stateKey(groundTruth, next);
      if (!seen.has(key)) {
        seen.set(key, next);
        queue.push(next);
      }
    }
  }

  return [...seen.values()];
}

function relationHolds(
  reachable: ReachableState[],
  condition: RelationEndpoint,
  requires: RelationEndpoint
): boolean {
  const conditioned = reachable.filter((state) => state[condition.entity] === condition.state);
  if (conditioned.length === 0) {
    throw new Error(`No reachable state satisfies ${condition.entity}=${condition.state}`);
  }
  return conditioned.every((state) => state[requires.entity] === requires.state);
}

function findCounterexample(
  reachable: ReachableState[],
  condition: RelationEndpoint,
  requires: RelationEndpoint
): ReachableState | null {
  return reachable.find(
    (state) => state[condition.entity] === condition.state && state[requires.entity] !== requires.state
  ) ?? null;
}

function relationPrompt(
  scheme: NamingScheme,
  condition: RelationEndpoint,
  requires: RelationEndpoint
): string {
  const condEntity = eName(scheme, condition.entity);
  const condState = sName(scheme, condition.entity, condition.state);
  const reqEntity = eName(scheme, requires.entity);
  const reqState = sName(scheme, requires.entity, requires.state);
  return `repositoryのコードを参照し、到達可能な状態について次の命題が常に成り立つか答えよ：${condEntity} が '${condState}' なら、${reqEntity} は '${reqState}' である。`;
}

function relationKey(condition: RelationEndpoint, requires: RelationEndpoint): string {
  return `${condition.entity}:${condition.state}->${requires.entity}:${requires.state}`;
}

/**
 * Stage 1 boolean primary probes.
 *
 * P6-0 with Luna found that the previous "matched negative" design leaked the label through
 * wording itself (e.g. "without checking X" vs "only when X=pex").  This v2 design therefore
 * uses one identical surface template for both labels.  Positive probes are the six true
 * ground-truth invariants; negative probes are relation candidates with an actually reachable
 * counterexample, selected deterministically.  No answer cue is added to the prompt.
 */
function buildSurfaceNeutralBooleanProbes(
  groundTruth: GroundTruth,
  scheme: NamingScheme
): GeneratedProbe[] {
  const reachable = enumerateReachableStates(groundTruth);
  const positives: GeneratedProbe[] = [];
  const negatives: GeneratedProbe[] = [];
  const usedNegativeRelations = new Set<string>();

  for (const invariant of groundTruth.invariants) {
    const condition: RelationEndpoint = invariant.condition;
    const requires: RelationEndpoint = invariant.requires;
    if (!relationHolds(reachable, condition, requires)) {
      throw new Error(`Ground-truth invariant ${invariant.id} is false in the reachable state graph`);
    }

    positives.push({
      probeId: `${scheme.schemeId}-bool-relation-${invariant.id}-positive`,
      type: "boolean",
      namingScheme: scheme.schemeId,
      prompt: relationPrompt(scheme, condition, requires),
      correctAnswer: true,
      derivedFrom: {
        kind: "invariant_relation_candidate",
        designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
        candidateSource: "ground-truth-invariant",
        invariantId: invariant.id,
        encoding: invariant.encoding,
        condition,
        requires,
      },
    });

    const candidates: RelationEndpoint[] = groundTruth.entities
      .flatMap((entity) => entity.states.map((state) => ({ entity: entity.id, state })))
      .filter((candidate) => candidate.entity !== condition.entity)
      .filter((candidate) => !(candidate.entity === requires.entity && candidate.state === requires.state))
      .sort((a, b) => {
        // Keep negatives lexically close to positives: prefer the same required state label first.
        const aSameState = a.state === requires.state ? 0 : 1;
        const bSameState = b.state === requires.state ? 0 : 1;
        if (aSameState !== bSameState) return aSameState - bSameState;
        return `${a.entity}:${a.state}`.localeCompare(`${b.entity}:${b.state}`);
      });

    const negativeRequires = candidates.find((candidate) => {
      const key = relationKey(condition, candidate);
      return !usedNegativeRelations.has(key) && !relationHolds(reachable, condition, candidate);
    });
    if (!negativeRequires) {
      throw new Error(`Unable to construct false relation candidate for ${invariant.id}`);
    }
    usedNegativeRelations.add(relationKey(condition, negativeRequires));
    const counterexample = findCounterexample(reachable, condition, negativeRequires);
    if (!counterexample) {
      throw new Error(`False relation candidate for ${invariant.id} has no reachable counterexample`);
    }

    negatives.push({
      probeId: `${scheme.schemeId}-bool-relation-${invariant.id}-negative`,
      type: "boolean",
      namingScheme: scheme.schemeId,
      prompt: relationPrompt(scheme, condition, negativeRequires),
      correctAnswer: false,
      derivedFrom: {
        kind: "invariant_relation_candidate",
        designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
        candidateSource: "reachable-counterexample",
        matchedInvariantId: invariant.id,
        condition,
        requires: negativeRequires,
        counterexampleState: counterexample,
      },
    });
  }

  // Do not preserve positive/negative pair adjacency.  A stable hash gives reproducible ordering
  // without making label predictable from the visible position in the prompt batch.
  return [...positives, ...negatives].sort((a, b) => {
    const key = (probe: GeneratedProbe) => crypto
      .createHash("sha256")
      .update(`${STAGE1_BOOLEAN_DESIGN_VERSION}:${probe.probeId}`)
      .digest("hex");
    return key(a).localeCompare(key(b));
  });
}

/**
 * Build the Stage 1 bank without mutating Stage 0.5's historical generator/fixture.
 * mc/stp remain reference-only (F9).  Boolean primary probes are replaced by the
 * surface-neutral relation bank above.
 */
export function generateStage1Probes(
  groundTruth: GroundTruth,
  scheme: NamingScheme,
  visibleTestPath?: string
): GeneratedProbe[] {
  const legacySafe = generateProbes(groundTruth, scheme, visibleTestPath).filter((p) => !p.f5Warning);
  const mc = legacySafe.filter((p) => p.type === "multiple_choice");
  const stp = legacySafe.filter((p) => p.type === "state_transition_prediction");
  const booleans = buildSurfaceNeutralBooleanProbes(groundTruth, scheme);
  return [...mc, ...booleans, ...stp];
}

export function auditStage1ProbeBank(probes: GeneratedProbe[]): Stage1ProbeAudit {
  const booleanProbes = probes.filter((p) => p.type === "boolean");
  const booleanTrue = booleanProbes.filter((p) => p.correctAnswer === true).length;
  const booleanFalse = booleanProbes.filter((p) => p.correctAnswer === false).length;
  const counterexampleNegativeCount = booleanProbes.filter(
    (p) => p.correctAnswer === false && p.derivedFrom.candidateSource === "reachable-counterexample"
  ).length;
  const surfaceNeutralBooleanCount = booleanProbes.filter(
    (p) => p.derivedFrom.kind === "invariant_relation_candidate" &&
      p.derivedFrom.designVersion === STAGE1_BOOLEAN_DESIGN_VERSION
  ).length;

  const alwaysTrueCorrect = booleanProbes.filter((p) => scoreProbe(p, "true").correct).length;
  const alwaysFalseCorrect = booleanProbes.filter((p) => scoreProbe(p, "false").correct).length;
  const denominator = booleanProbes.length || 1;

  const batchBooleanBalance: Stage1ProbeBatchAudit[] = [];
  for (let start = 0, batchIndex = 0; start < probes.length; start += STAGE1_PROBE_BATCH_SIZE, batchIndex++) {
    const booleans = probes.slice(start, start + STAGE1_PROBE_BATCH_SIZE).filter((p) => p.type === "boolean");
    batchBooleanBalance.push({
      batchIndex,
      booleanTrue: booleans.filter((p) => p.correctAnswer === true).length,
      booleanFalse: booleans.filter((p) => p.correctAnswer === false).length,
    });
  }

  const f5Warnings = probes.filter((p) => p.f5Warning).map((p) => p.probeId);
  const rawGroundTruthIdLeakage = probes
    .filter((p) => /\b(?:E|O|I)\d+\b/.test(p.prompt))
    .map((p) => p.probeId);
  const cuePattern = /確認せず|場合に限って|このinvariant|既存のinvariantを壊す|matched negative/i;
  const booleanCueWarnings = booleanProbes.filter((p) => cuePattern.test(p.prompt)).map((p) => p.probeId);
  const promptCounts = new Map<string, number>();
  for (const probe of booleanProbes) promptCounts.set(probe.prompt, (promptCounts.get(probe.prompt) ?? 0) + 1);
  const duplicateBooleanPrompts = [...promptCounts.entries()].filter(([, count]) => count > 1).map(([prompt]) => prompt);

  return {
    total: probes.length,
    booleanTotal: booleanProbes.length,
    booleanTrue,
    booleanFalse,
    counterexampleNegativeCount,
    surfaceNeutralBooleanCount,
    alwaysTrueAccuracy: alwaysTrueCorrect / denominator,
    alwaysFalseAccuracy: alwaysFalseCorrect / denominator,
    batchBooleanBalance,
    f5Warnings,
    rawGroundTruthIdLeakage,
    booleanCueWarnings,
    duplicateBooleanPrompts,
  };
}

export function assertStage1ProbeBankValid(probes: GeneratedProbe[]): Stage1ProbeAudit {
  const audit = auditStage1ProbeBank(probes);
  if (audit.booleanTotal === 0) throw new Error("Stage 1 probe bank must contain boolean probes");
  if (audit.booleanTrue !== audit.booleanFalse) {
    throw new Error(`Stage 1 boolean labels are imbalanced: true=${audit.booleanTrue}, false=${audit.booleanFalse}`);
  }
  if (audit.counterexampleNegativeCount !== audit.booleanFalse) {
    throw new Error(
      `Every Stage 1 negative boolean probe must have a reachable counterexample: ` +
      `counterexamples=${audit.counterexampleNegativeCount}, false=${audit.booleanFalse}`
    );
  }
  if (audit.surfaceNeutralBooleanCount !== audit.booleanTotal) {
    throw new Error(
      `All Stage 1 boolean probes must use ${STAGE1_BOOLEAN_DESIGN_VERSION}: ` +
      `${audit.surfaceNeutralBooleanCount}/${audit.booleanTotal}`
    );
  }
  if (audit.alwaysTrueAccuracy > 0.5 || audit.alwaysFalseAccuracy > 0.5) {
    throw new Error(
      `Constant-answer baseline too strong: alwaysTrue=${audit.alwaysTrueAccuracy}, alwaysFalse=${audit.alwaysFalseAccuracy}`
    );
  }
  for (const batch of audit.batchBooleanBalance) {
    if (batch.booleanTrue !== batch.booleanFalse) {
      throw new Error(
        `Stage 1 boolean labels are positionally imbalanced in API batch ${batch.batchIndex}: ` +
        `true=${batch.booleanTrue}, false=${batch.booleanFalse}`
      );
    }
  }
  if (audit.f5Warnings.length > 0) {
    throw new Error(`Stage 1 probe bank contains F5 leakage warnings: ${audit.f5Warnings.join(", ")}`);
  }
  if (audit.rawGroundTruthIdLeakage.length > 0) {
    throw new Error(`Stage 1 prompts leak raw ground-truth ids: ${audit.rawGroundTruthIdLeakage.join(", ")}`);
  }
  if (audit.booleanCueWarnings.length > 0) {
    throw new Error(`Stage 1 boolean prompts contain answer-cue wording: ${audit.booleanCueWarnings.join(", ")}`);
  }
  if (audit.duplicateBooleanPrompts.length > 0) {
    throw new Error(`Stage 1 boolean prompts contain duplicates: ${audit.duplicateBooleanPrompts.join(" | ")}`);
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
  const fixturesDir = path.join(__dirname, "../fixtures");
  const outputPath = path.join(fixturesDir, "probe-bank-stage1.json");
  const auditPath = path.join(fixturesDir, "probe-bank-stage1.audit.json");
  fs.writeFileSync(outputPath, JSON.stringify(probes, null, 2) + "\n", "utf8");
  fs.writeFileSync(auditPath, JSON.stringify({
    fixture: "probe-bank-stage1.json",
    designVersion: STAGE1_BOOLEAN_DESIGN_VERSION,
    audit,
  }, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ outputPath, auditPath, designVersion: STAGE1_BOOLEAN_DESIGN_VERSION, audit }, null, 2));
}
