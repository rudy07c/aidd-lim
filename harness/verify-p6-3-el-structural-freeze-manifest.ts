import assert from "assert";
import * as fs from "fs";
import * as path from "path";

interface CandidateExposure {
  label: string;
  nominal: number;
  actual: number;
  selectedUnitCount: number;
  exposureSetHash: string;
  staticPayloadHash: string;
  categoryUnitCounts: Record<string, number>;
  categoryStaticPayloadTokens: Record<string, number>;
}

interface CandidatePlan {
  planId: string;
  kind: "M" | "Rsem";
  selectorPlanHash: string;
  exposures: CandidateExposure[];
}

interface FreezeCandidate {
  schemaVersion: string;
  status: string;
  candidateFingerprintSha256: string;
  freezeCandidate: unknown;
  fingerprints: unknown;
  planCount: number;
  plans: CandidatePlan[];
  failures: string[];
}

const candidatePath = process.env.P6_3_FREEZE_CANDIDATE_OUTPUT
  ? path.resolve(process.cwd(), process.env.P6_3_FREEZE_CANDIDATE_OUTPUT)
  : path.resolve(__dirname, "../runs/_smoke/p6-3-el-structural-freeze-candidate.json");
const manifestPath = path.resolve(__dirname, "frozen/p6-3-el-structural-freeze.json");

assert(fs.existsSync(candidatePath), `missing structural freeze candidate: ${candidatePath}`);
assert(fs.existsSync(manifestPath), `missing frozen structural manifest: ${manifestPath}`);

const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as FreezeCandidate;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;

assert.strictEqual(
  candidate.status,
  "pass",
  `candidate must pass before it can match a frozen manifest; got ${candidate.status}`
);
assert.deepStrictEqual(candidate.failures, [], "candidate must contain no structural failures");

const normalized = normalizeExposures(candidate.plans);
const expectedManifest = {
  schemaVersion: "p6-3-el-structural-freeze-manifest-v2",
  sourceCandidateSchemaVersion: candidate.schemaVersion,
  candidateFingerprintSha256: candidate.candidateFingerprintSha256,
  status: "frozen-pass",
  freezeCandidate: candidate.freezeCandidate,
  fingerprints: candidate.fingerprints,
  planCount: candidate.planCount,
  exposureProfiles: normalized.exposureProfiles,
  planSummaries: normalized.planSummaries,
  failures: candidate.failures,
};

const expectedManifestOutput = process.env.P6_3_EXPECTED_FREEZE_MANIFEST_OUTPUT;
if (expectedManifestOutput) {
  const absoluteOutputPath = path.resolve(process.cwd(), expectedManifestOutput);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, `${JSON.stringify(expectedManifest, null, 2)}\n`, "utf8");
}

assert.deepStrictEqual(
  manifest,
  expectedManifest,
  "committed P6-3 structural freeze manifest differs from the recomputed candidate; live calibration must remain blocked until a new versioned freeze is predeclared"
);

console.log(
  JSON.stringify(
    {
      status: "ok",
      manifest: path.relative(path.resolve(__dirname, ".."), manifestPath),
      candidateFingerprintSha256: candidate.candidateFingerprintSha256,
      T_EL: (candidate.freezeCandidate as { T_EL?: number }).T_EL ?? null,
      planCount: candidate.planCount,
      exposureProfileCount: normalized.exposureProfiles.length,
    },
    null,
    2
  )
);

function normalizeExposures(plans: CandidatePlan[]): {
  exposureProfiles: Array<CandidateExposure & { profileId: string }>;
  planSummaries: Array<{
    planId: string;
    kind: "M" | "Rsem";
    selectorPlanHash: string;
    budgetProfiles: Record<string, string>;
  }>;
} {
  const exposureProfiles: Array<CandidateExposure & { profileId: string }> = [];
  const profileIdsByCanonicalExposure = new Map<string, string>();

  const planSummaries = plans.map((plan) => {
    const budgetProfiles: Record<string, string> = {};
    for (const exposure of plan.exposures) {
      const canonical = stableStringify(exposure);
      let profileId = profileIdsByCanonicalExposure.get(canonical);
      if (!profileId) {
        profileId = `profile-${String(exposureProfiles.length + 1).padStart(2, "0")}`;
        profileIdsByCanonicalExposure.set(canonical, profileId);
        exposureProfiles.push({ profileId, ...exposure });
      }
      budgetProfiles[exposure.label] = profileId;
    }
    return {
      planId: plan.planId,
      kind: plan.kind,
      selectorPlanHash: plan.selectorPlanHash,
      budgetProfiles,
    };
  });

  return { exposureProfiles, planSummaries };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = sortForStableJson((value as Record<string, unknown>)[key]);
  }
  return result;
}
