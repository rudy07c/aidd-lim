import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { generateStage1Probes } from "../calibration/src/stage1-probes";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import type { GroundTruth, NamingScheme } from "../synthetic-world/schema";
import {
  buildP63RSemPromptP62Compatible,
  buildP63RSemSchemaP62Compatible,
} from "./src/p6/p6-3-rsem-protocol-parity";

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const groundTruth = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "ground_truth.json"), "utf8")
  ) as GroundTruth;
  const namingSchemes = JSON.parse(
    fs.readFileSync(path.join(syntheticWorldDir, "naming_schemes.json"), "utf8")
  ) as NamingScheme[];
  const namingScheme = namingSchemes.find((candidate) => candidate.schemeId === "A-obfuscated");
  assert(namingScheme, "missing A-obfuscated naming scheme");

  const probes = generateStage1Probes(
    groundTruth,
    namingScheme,
    path.join(syntheticWorldDir, "repository/tests/rules.visible.test.ts")
  ).filter((probe) => probe.type === "boolean") as GeneratedProbe[];
  assert.equal(probes.length, 12, "expected frozen 12-probe boolean bank");

  const probesWithCounterexampleState = probes.filter(
    (probe: any) => probe.derivedFrom?.counterexampleState !== undefined
  );
  assert(
    probesWithCounterexampleState.length > 0,
    "leak-proofing check would be vacuous: no probe contains derivedFrom.counterexampleState"
  );

  const contextFixture = {
    "a.ts": "export const a = 1;\n",
    "z.ts": "export const z = 2;\n",
  };
  const baselinePrompt = buildP63RSemPromptP62Compatible(contextFixture, probes);
  const baselineSchema = buildP63RSemSchemaP62Compatible(probes);

  const poisoned = JSON.parse(JSON.stringify(probes)) as GeneratedProbe[];
  let poisonedCounterexampleStates = 0;
  for (const probe of poisoned as any[]) {
    probe.correctAnswer = !Boolean(probe.correctAnswer);
    const hadCounterexampleState = probe.derivedFrom?.counterexampleState !== undefined;
    probe.derivedFrom = {
      ...(probe.derivedFrom ?? {}),
      candidateSource: "POISONED-CANDIDATE-SOURCE",
      matchedInvariantId: "POISONED-INVARIANT",
      counterexampleState: { POISONED_ENTITY: "POISONED_STATE" },
    };
    if (hadCounterexampleState) poisonedCounterexampleStates += 1;
  }
  assert.equal(
    poisonedCounterexampleStates,
    probesWithCounterexampleState.length,
    "did not poison every actual counterexampleState-bearing probe"
  );

  assert.equal(
    buildP63RSemPromptP62Compatible(contextFixture, poisoned),
    baselinePrompt,
    "Rsem prompt changed after poisoning correctAnswer/counterexample provenance"
  );
  assert.deepEqual(
    buildP63RSemSchemaP62Compatible(poisoned),
    baselineSchema,
    "Rsem schema changed after poisoning correctAnswer/counterexample provenance"
  );

  console.log(JSON.stringify({
    status: "ok",
    probeCount: probes.length,
    counterexampleStateProbeCount: probesWithCounterexampleState.length,
    poisonedCounterexampleStateProbeCount: poisonedCounterexampleStates,
  }, null, 2));
}

main();
