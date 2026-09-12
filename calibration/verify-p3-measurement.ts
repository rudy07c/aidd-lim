import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  ALL_BUDGETS,
  AssemblyMode,
  BudgetValue,
  FileCategory,
  assembleContext,
} from "./src/budget-assembler";
import { GeneratedProbe, generateProbes } from "./src/probe-generator";
import { scoreProbe } from "./src/probe-scorer";
import { assertStage1ProbeBankValid, generateStage1Probes } from "./src/stage1-probes";
import {
  CANONICAL_TOKEN_COUNT_METHOD,
  countCanonicalFileContentTokens,
  countCanonicalTokens,
} from "../harness/src/measurement/token-counter";
import {
  chunkArtifactFile,
  repositoryToArtifactUnits,
  serializeArtifactUnitForWorkingSet,
} from "../harness/src/measurement/artifact-unit";
import { OBSERVABLE_TOKEN_COUNT_METHOD } from "../harness/src/context/observable-interaction";
import type { GroundTruth, NamingScheme } from "../synthetic-world/schema";

interface LegacyFileDetail {
  path: string;
  category: FileCategory;
  originalChars: number;
  includedChars: number;
  truncated: boolean;
}

function loadRepository(dir: string, baseDir: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) loadRepository(fullPath, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, fullPath).replace(/\\/g, "/")] = fs.readFileSync(fullPath, "utf8");
    }
  }
}

function legacyCategory(filePath: string, content: string): FileCategory {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith("protocol_adapter.ts")) return "fixed_contract";
  if (/^export\s+(type|interface)\s/m.test(content)) return "type_definition";
  if (
    normalized.includes("/tests/") ||
    normalized.startsWith("tests/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.ts")
  ) return "test";
  return "implementation";
}

function legacyAssembleReference(
  repositoryFiles: Record<string, string>,
  budget: BudgetValue,
  mode: AssemblyMode
): { files: Record<string, string>; totalTokens: number; fileDetails: LegacyFileDetail[] } {
  if (budget === 0) return { files: {}, totalTokens: 0, fileDetails: [] };
  const system2: Record<FileCategory, number> = {
    type_definition: 0, fixed_contract: 1, test: 2, implementation: 3,
  };
  const system1: Record<FileCategory, number> = {
    type_definition: 0, fixed_contract: 1, test: 1, implementation: 1,
  };
  const priority = mode === "system1" ? system1 : system2;
  const entries = Object.entries(repositoryFiles)
    .map(([filePath, content]) => ({ filePath, content, category: legacyCategory(filePath, content) }))
    .sort((a, b) => priority[a.category] - priority[b.category] || a.filePath.localeCompare(b.filePath));

  const files: Record<string, string> = {};
  const fileDetails: LegacyFileDetail[] = [];
  if (budget === "full") {
    for (const item of entries) {
      files[item.filePath] = item.content;
      fileDetails.push({
        path: item.filePath,
        category: item.category,
        originalChars: item.content.length,
        includedChars: item.content.length,
        truncated: false,
      });
    }
  } else {
    const budgetChars = budget * 4;
    let usedChars = 0;
    for (const item of entries) {
      if (usedChars >= budgetChars) {
        fileDetails.push({
          path: item.filePath,
          category: item.category,
          originalChars: item.content.length,
          includedChars: 0,
          truncated: true,
        });
        continue;
      }
      const remaining = budgetChars - usedChars;
      const included = item.content.slice(0, remaining);
      files[item.filePath] = included;
      usedChars += included.length;
      fileDetails.push({
        path: item.filePath,
        category: item.category,
        originalChars: item.content.length,
        includedChars: included.length,
        truncated: included.length < item.content.length,
      });
    }
  }
  const totalChars = Object.values(files).reduce((sum, content) => sum + content.length, 0);
  return { files, totalTokens: Math.ceil(totalChars / 4), fileDetails };
}

function verifyLegacyRegression(repositoryFiles: Record<string, string>): void {
  for (const mode of ["system1", "system2"] as const) {
    for (const budget of ALL_BUDGETS) {
      const actual = assembleContext(repositoryFiles, budget, mode);
      const expected = legacyAssembleReference(repositoryFiles, budget, mode);
      assert.deepStrictEqual(actual.files, expected.files, `legacy files drifted for ${mode}/${budget}`);
      assert.strictEqual(actual.totalTokens, expected.totalTokens, `legacy token approximation drifted for ${mode}/${budget}`);
      assert.deepStrictEqual(actual.fileDetails, expected.fileDetails, `legacy file details drifted for ${mode}/${budget}`);
      assert.strictEqual(actual.canonicalTokens, countCanonicalFileContentTokens(actual.files));
      assert.strictEqual(actual.canonicalTokenCountMethod, CANONICAL_TOKEN_COUNT_METHOD);
    }
  }
}

function verifyArtifactUnits(repositoryFiles: Record<string, string>): void {
  const sample = "first line\n" + "x".repeat(180) + "\nlast line\n";
  const sampleBudget = 32;
  const chunks = chunkArtifactFile("src\\sample.ts", sample, sampleBudget);
  assert.strictEqual(chunks.map((unit) => unit.content).join(""), sample, "ArtifactUnit chunking must be lossless");
  assert.ok(chunks.length > 1, "small working-set budget must produce multiple units");
  assert.ok(chunks.every((unit) => unit.tokenCount <= sampleBudget), "every ArtifactUnit must obey its complete model-visible evidence token cap");
  assert.ok(chunks.every((unit) => unit.path === "src/sample.ts"), "ArtifactUnit paths must be normalized");
  assert.deepStrictEqual(chunkArtifactFile("src/sample.ts", sample, sampleBudget), chunks, "chunking must be deterministic");

  for (const unit of chunks) {
    const serialized = serializeArtifactUnitForWorkingSet(unit);
    assert.strictEqual(unit.tokenCount, countCanonicalTokens(serialized));
    assert.ok(serialized.includes(`\"path\":\"${unit.path}\"`));
    assert.ok(serialized.includes(`\"lines\":[${unit.startLine},${unit.endLine}]`));
    assert.ok(!serialized.includes("\"kind\""), "harness-side ArtifactUnit kind must not become model-visible evidence");
  }

  const repoUnits = repositoryToArtifactUnits(repositoryFiles, 128);
  assert.ok(repoUnits.length > 0);
  assert.strictEqual(new Set(repoUnits.map((unit) => unit.id)).size, repoUnits.length, "ArtifactUnit ids must be unique");
  assert.ok(repoUnits.every((unit) => unit.tokenCount <= 128));
  for (const [filePath, content] of Object.entries(repositoryFiles)) {
    const reconstructed = repoUnits
      .filter((unit) => unit.path === filePath.replace(/\\/g, "/"))
      .map((unit) => unit.content)
      .join("");
    assert.strictEqual(reconstructed, content, `ArtifactUnit reconstruction failed for ${filePath}`);
  }
}

function verifyBooleanParsing(stage1Probes: GeneratedProbe[]): void {
  const positive = stage1Probes.find((p) => p.type === "boolean" && p.correctAnswer === true);
  const negative = stage1Probes.find((p) => p.type === "boolean" && p.correctAnswer === false);
  assert.ok(positive && negative);
  assert.strictEqual(scoreProbe(positive, "YES").correct, true);
  assert.strictEqual(scoreProbe(positive, "はい").correct, true);
  assert.strictEqual(scoreProbe(negative, "NO").correct, true);
  assert.strictEqual(scoreProbe(negative, "いいえ").correct, true);
  const malformed = scoreProbe(positive, "maybe");
  assert.strictEqual(malformed.correct, false);
  assert.ok(malformed.parseError, "malformed boolean answer must be recorded as parse error");
}

function main(): void {
  const root = path.resolve(__dirname, "..");
  const swDir = path.join(root, "synthetic-world");
  const repositoryDir = path.join(swDir, "repository");
  const repositoryFiles: Record<string, string> = {};
  loadRepository(repositoryDir, repositoryDir, repositoryFiles);

  const groundTruth: GroundTruth = JSON.parse(fs.readFileSync(path.join(swDir, "ground_truth.json"), "utf8"));
  const schemes: NamingScheme[] = JSON.parse(fs.readFileSync(path.join(swDir, "naming_schemes.json"), "utf8"));
  const scheme = schemes.find((candidate) => candidate.schemeId === "A-obfuscated");
  assert.ok(scheme, "A-obfuscated naming scheme must exist");
  const visibleTestPath = path.join(repositoryDir, "tests/rules.visible.test.ts");

  // The historical Stage 0.5 bank must remain byte-for-byte semantically reproducible.
  const legacyFixture: GeneratedProbe[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures/probe-bank.json"), "utf8")
  );
  const regeneratedLegacy = generateProbes(groundTruth, scheme, visibleTestPath).filter((p) => !p.f5Warning);
  assert.deepStrictEqual(regeneratedLegacy, legacyFixture, "legacy Stage 0.5 probe bank drifted");

  const stage1Probes = generateStage1Probes(groundTruth, scheme, visibleTestPath);
  const audit = assertStage1ProbeBankValid(stage1Probes);
  assert.strictEqual(audit.alwaysTrueAccuracy, 0.5);
  assert.strictEqual(audit.alwaysFalseAccuracy, 0.5);
  verifyBooleanParsing(stage1Probes);

  assert.strictEqual(countCanonicalTokens("hello world"), 2, "o200k_base sanity check drifted");
  assert.ok(countCanonicalTokens("有限コンテキスト") > 0);
  assert.strictEqual(OBSERVABLE_TOKEN_COUNT_METHOD, CANONICAL_TOKEN_COUNT_METHOD);

  verifyLegacyRegression(repositoryFiles);
  verifyArtifactUnits(repositoryFiles);

  console.log(JSON.stringify({
    status: "ok",
    canonicalTokenCountMethod: CANONICAL_TOKEN_COUNT_METHOD,
    legacyProbeCount: legacyFixture.length,
    stage1ProbeAudit: audit,
    artifactUnitsAt128Tokens: repositoryToArtifactUnits(repositoryFiles, 128).length,
    verified: [
      "balanced-boolean-probes",
      "matched-negative-probes",
      "constant-answer-baseline-rejection",
      "visible-test-and-raw-id-leakage-scan",
      "boolean-parse-robustness",
      "canonical-o200k-token-counter",
      "observable-history-canonical-accounting",
      "ArtifactUnit-lossless-bounded-model-visible-evidence-chunking",
      "legacy-probe-bank-regression",
      "legacy-static-budget-regression",
    ],
  }, null, 2));
}

main();
