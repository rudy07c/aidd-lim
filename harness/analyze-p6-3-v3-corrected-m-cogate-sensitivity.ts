import * as fs from "fs";
import * as path from "path";
import {
  P6_3_V3_ARTIFACT_BUDGETS,
  P6_3_V3_DELTA_M,
  P6_3_V3_DELTA_R,
  selectP63V3ArtifactBudget,
  type P63V3ArmAggregate,
} from "./src/p6/p6-3-v3-calibration-predeclaration";

const ARM_ORDER = ["B0", "B1", "B2", "B3", "B4", "AF"] as const;
type Arm = (typeof ARM_ORDER)[number];

type Sensitivity = {
  analysisClass?: string;
  primaryEvidenceMutated?: boolean;
  providerCallsMade?: boolean;
  scope?: string;
  summary?: {
    byArm?: Record<string, {
      total?: number;
      correctedPasses?: number;
      originalPasses?: number;
    }>;
  };
};

type SplitResult = {
  arms?: Array<{
    arm?: string;
    rsem?: {
      correct?: number;
      total?: number;
      mean?: number;
    };
  }>;
};

function main(): void {
  const sensitivityPath = requireArg("--sensitivity");
  const splitPath = requireArg("--split-provenance");
  const outPath = optionalArg("--out");

  const sensitivity = readJson<Sensitivity>(sensitivityPath);
  const split = readJson<SplitResult>(splitPath);

  if (
    sensitivity.analysisClass !== "post-hoc-design-audit-sensitivity" ||
    sensitivity.primaryEvidenceMutated !== false ||
    sensitivity.providerCallsMade !== false ||
    sensitivity.scope !== "full"
  ) {
    throw new Error("Corrected-M sensitivity provenance/scope mismatch");
  }

  const byArm = sensitivity.summary?.byArm;
  if (!byArm) throw new Error("Corrected-M sensitivity missing summary.byArm");
  if (!Array.isArray(split.arms)) {
    throw new Error("Split-provenance result missing arms[]");
  }

  const splitByArm = new Map<string, NonNullable<SplitResult["arms"]>[number]>();
  for (const arm of split.arms) {
    if (typeof arm.arm === "string") splitByArm.set(arm.arm, arm);
  }

  const aggregates: P63V3ArmAggregate[] = ARM_ORDER.map((label) => {
    const m = byArm[label];
    if (!m || m.total !== 132 || !Number.isInteger(m.correctedPasses)) {
      throw new Error(`${label}: corrected M summary must be correctedPasses/132`);
    }
    const splitArm = splitByArm.get(label);
    const rsem = splitArm?.rsem;
    if (
      !rsem ||
      !Number.isInteger(rsem.correct) ||
      rsem.total !== 144 ||
      typeof rsem.mean !== "number"
    ) {
      throw new Error(`${label}: split-provenance Rsem must be correct/144 with mean`);
    }
    const derived = (rsem.correct as number) / 144;
    if (Math.abs(derived - rsem.mean) > 1e-12) {
      throw new Error(`${label}: split-provenance Rsem mean/count mismatch`);
    }
    return {
      label,
      mRate: (m.correctedPasses as number) / 132,
      rsemRate: derived,
    };
  });

  const selection = selectP63V3ArtifactBudget(aggregates);
  const byLabel = new Map(aggregates.map((arm) => [arm.label, arm]));
  const b0 = byLabel.get("B0")!;
  const af = byLabel.get("AF")!;

  const diagnostics = ARM_ORDER
    .filter((arm): arm is Exclude<Arm, "B0" | "AF"> => arm !== "B0" && arm !== "AF")
    .map((label) => {
      const arm = byLabel.get(label)!;
      const mLower = arm.mRate - b0.mRate;
      const mUpper = af.mRate - arm.mRate;
      const rLower = arm.rsemRate - b0.rsemRate;
      const rUpper = af.rsemRate - arm.rsemRate;
      return {
        arm: label,
        budget: P6_3_V3_ARTIFACT_BUDGETS[label],
        correctedM: arm.mRate,
        rsem: arm.rsemRate,
        margins: {
          mAboveB0: mLower,
          mBelowAF: mUpper,
          rsemAboveB0: rLower,
          rsemBelowAF: rUpper,
        },
        guards: {
          mAboveB0: mLower >= P6_3_V3_DELTA_M,
          mBelowAF: mUpper >= P6_3_V3_DELTA_M,
          rsemAboveB0: rLower >= P6_3_V3_DELTA_R,
          rsemBelowAF: rUpper >= P6_3_V3_DELTA_R,
        },
      };
    });

  const result = {
    schemaVersion: "p6-3-v3-corrected-m-cogate-sensitivity-v1",
    analysisClass: "post-hoc-design-audit-sensitivity",
    primaryResultReplaced: false,
    confirmatoryClaim: false,
    stage1AEffectClaim: false,
    providerCallsMade: false,
    sources: {
      correctedMSensitivityPath: path.resolve(sensitivityPath),
      splitProvenancePath: path.resolve(splitPath),
    },
    frozenRuleReusedUnchanged: {
      deltaM: P6_3_V3_DELTA_M,
      deltaR: P6_3_V3_DELTA_R,
      selectorFunction: "selectP63V3ArtifactBudget",
      tieBreak: "smallest-qualifying-interior-budget",
    },
    aggregates,
    diagnostics,
    sensitivitySelection: selection,
    interpretation:
      "Post-hoc sensitivity only. The frozen primary result remains needs-design-audit and is not replaced by this selection.",
  };

  if (outPath) {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(result, null, 2) + "\n", "utf8");
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as T;
}

function requireArg(name: string): string {
  const value = optionalArg(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalArg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i < 0) return null;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

main();
