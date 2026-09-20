import * as fs from "fs";
import * as path from "path";
import {
  classifyFailure,
  classifyTaskEligibility,
  DEFAULT_P6_1_ELIGIBILITY_RULE,
  P6_1_FAILURE_CLASSIFICATION_VERSION,
} from "./src/p6/failure-classification";

const argPath = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
if (!argPath) {
  throw new Error("Usage: npm run p6:reclassify-result -- <result.json> [--write]");
}

const resultPath = path.resolve(argPath);
const data = JSON.parse(fs.readFileSync(resultPath, "utf8"));
if (!data?.p6_1?.taskResults || !Array.isArray(data.p6_1.taskResults)) {
  throw new Error("result.json does not contain p6_1.taskResults");
}

const legacyClassifications = data.p6_1.classifications ?? null;
const taskResults = data.p6_1.taskResults.map((result: any) => ({
  ...result,
  ...classifyFailure(result),
}));
const taskIds: string[] = data.p6_1.pilotTasks ?? [...new Set(taskResults.map((result: any) => result.taskId))];
const classifications = taskIds.map((taskId: string) =>
  classifyTaskEligibility(taskResults.filter((result: any) => result.taskId === taskId), DEFAULT_P6_1_ELIGIBILITY_RULE)
);

data.criteria = data.criteria ?? {};
data.criteria.p6_1 = {
  ...(data.criteria.p6_1 ?? {}),
  classificationVersion: P6_1_FAILURE_CLASSIFICATION_VERSION,
  ...DEFAULT_P6_1_ELIGIBILITY_RULE,
  floorBasis: "semantic-failure-only",
  protocolFailureRole: "agent-output-reliability-diagnostic-only",
};
data.p6_1.taskResults = taskResults;
if (legacyClassifications && !data.p6_1.legacyClassifications) data.p6_1.legacyClassifications = legacyClassifications;
data.p6_1.classifications = classifications;
data.p6_1.reclassification = {
  version: P6_1_FAILURE_CLASSIFICATION_VERSION,
  source: "existing failureCategory/failureReason/executionStatus; no API rerun",
};

const rendered = JSON.stringify(data, null, 2) + "\n";
if (process.argv.includes("--write")) {
  fs.writeFileSync(resultPath, rendered);
  console.error(`Reclassified in place: ${resultPath}`);
} else {
  process.stdout.write(rendered);
}
