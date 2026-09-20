import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { applyP62Adjudication, type P62AdjudicationFinalDisposition } from "./src/p6/adjudication";
import { recomputeP62Result, type P62AfBaselineResult } from "./p6-af-baseline-live";

function argValue(name: string): string | null {
  const token = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return token ? token.slice(name.length + 3) : null;
}

const positional = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
if (!positional) {
  throw new Error("Usage: npm run p6:adjudicate-af-baseline -- <result.json> --measurement=M|Rsem --repeat=N [--task=T-...] --reviewer=... --disposition=scientific-failure|protocol-failure|infrastructure-invalid --reason=... [--write]");
}
const resultPath = path.resolve(positional);
const measurement = argValue("measurement");
if (measurement !== "M" && measurement !== "Rsem") throw new Error("--measurement must be M or Rsem");
const repeat = Number(argValue("repeat"));
const reviewer = argValue("reviewer") ?? "";
const reason = argValue("reason") ?? "";
const disposition = argValue("disposition") as P62AdjudicationFinalDisposition | null;
if (!disposition || !["scientific-failure", "protocol-failure", "infrastructure-invalid"].includes(disposition)) {
  throw new Error("invalid --disposition");
}
const scriptSha = crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
const result = JSON.parse(fs.readFileSync(resultPath, "utf8")) as P62AfBaselineResult;
applyP62Adjudication(result, {
  measurement,
  taskId: argValue("task"),
  repeat,
  reviewer,
  reason,
  finalDisposition: disposition,
}, scriptSha);
recomputeP62Result(result);
const rendered = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--write")) {
  const tmp = `${resultPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, rendered, "utf8");
  fs.renameSync(tmp, resultPath);
  console.error(`Adjudicated P6-2 result in place: ${resultPath}`);
} else {
  process.stdout.write(rendered);
}
