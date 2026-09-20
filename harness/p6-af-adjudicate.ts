import * as fs from "fs";
import * as path from "path";

interface Args {
  resultPath: string;
  measurement: "M" | "Rsem";
  taskId: string | null;
  repeat: number;
  auditor: string;
  reason: string;
  disposition: "scientific-failure" | "infrastructure-invalid";
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const token = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return token ? token.slice(prefix.length) : null;
}

function parseArgs(): Args {
  const resultPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!resultPath) throw new Error("Usage: ts-node p6-af-adjudicate.ts <result.json> --measurement=M|Rsem --repeat=N [--task-id=ID] --auditor=NAME --reason=TEXT --disposition=scientific-failure|infrastructure-invalid");
  const measurement = argValue("measurement");
  const disposition = argValue("disposition");
  const repeat = Number(argValue("repeat"));
  const auditor = argValue("auditor") ?? "";
  const reason = argValue("reason") ?? "";
  if (measurement !== "M" && measurement !== "Rsem") throw new Error("--measurement must be M or Rsem");
  if (disposition !== "scientific-failure" && disposition !== "infrastructure-invalid") throw new Error("invalid --disposition");
  if (!Number.isInteger(repeat) || repeat <= 0) throw new Error("--repeat must be positive integer");
  if (!auditor.trim()) throw new Error("--auditor is required");
  if (!reason.trim()) throw new Error("--reason is required");
  const taskId = measurement === "M" ? argValue("task-id") : null;
  if (measurement === "M" && !taskId) throw new Error("M adjudication requires --task-id");
  if (measurement === "Rsem" && disposition === "scientific-failure") {
    throw new Error("Rsem protocol/system failures may not be converted into semantic wrong answers; use infrastructure-invalid after audit or leave needs-audit unresolved");
  }
  return { resultPath: path.resolve(resultPath), measurement, taskId, repeat, auditor, reason, disposition };
}

function atomicWrite(filePath: string, value: unknown): void {
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function main(): void {
  const args = parseArgs();
  const result = JSON.parse(fs.readFileSync(args.resultPath, "utf8"));
  if (!String(result?.schemaVersion ?? "").startsWith("p6-2-af-baseline-result-")) {
    throw new Error("not a P6-2 AF baseline result");
  }
  if (result.status !== "needs-audit") throw new Error(`adjudication requires status=needs-audit, got ${result.status}`);
  const flags: any[] = Array.isArray(result.auditFlags) ? result.auditFlags : [];
  const flagIndex = flags.findIndex((flag) =>
    flag.measurement === args.measurement && flag.repeat === args.repeat &&
    (args.measurement === "Rsem" || flag.taskId === args.taskId)
  );
  if (flagIndex < 0) throw new Error("matching unresolved auditFlag not found");

  const now = new Date().toISOString();
  let source: any;
  if (args.measurement === "M") {
    const rows: any[] = result.measurements.M.repeatResults;
    const index = rows.findIndex((row) => row.taskId === args.taskId && row.repeat === args.repeat);
    if (index < 0) throw new Error("matching M repeat result not found");
    source = JSON.parse(JSON.stringify(rows[index]));
    if (args.disposition === "scientific-failure") {
      rows[index].rawFailureDomain = source.rawFailureDomain ?? source.failureDomain;
      rows[index].adjudication = {
        auditor: args.auditor,
        reason: args.reason,
        finalDisposition: args.disposition,
        adjudicatedAt: now,
      };
      rows[index].failureDomain = "semantic";
      rows[index].semanticFailure = true;
      rows[index].protocolFailure = false;
      rows[index].systemFailure = false;
      rows[index].infrastructureFailure = false;
      rows[index].validity = "valid";
      rows[index].passed = false;
    } else {
      rows.splice(index, 1);
      const dir = path.join(path.dirname(args.resultPath), "m", String(args.taskId), `repeat-${args.repeat}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } else {
    const rows: any[] = result.measurements.Rsem.repeatResults;
    const index = rows.findIndex((row) => row.repeat === args.repeat);
    if (index < 0) throw new Error("matching Rsem repeat result not found");
    source = JSON.parse(JSON.stringify(rows[index]));
    rows.splice(index, 1);
    const dir = path.join(path.dirname(args.resultPath), "rsem", `repeat-${args.repeat}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  result.adjudicationHistory = Array.isArray(result.adjudicationHistory) ? result.adjudicationHistory : [];
  result.adjudicationHistory.push({
    measurement: args.measurement,
    taskId: args.taskId,
    repeat: args.repeat,
    rawFailureDomain: source.rawFailureDomain ?? source.failureDomain,
    rawExecutionStatus: source.executionStatus ?? null,
    rawResult: source,
    auditor: args.auditor,
    reason: args.reason,
    finalDisposition: args.disposition,
    adjudicatedAt: now,
  });
  flags.splice(flagIndex, 1);
  result.auditFlags = flags;
  result.status = flags.length ? "needs-audit" : "running";
  result.completedAt = null;
  result.updatedAt = now;
  atomicWrite(args.resultPath, result);
  console.log(JSON.stringify({
    status: "adjudicated",
    measurement: args.measurement,
    taskId: args.taskId,
    repeat: args.repeat,
    rawFailureDomain: source.rawFailureDomain ?? source.failureDomain,
    finalDisposition: args.disposition,
    resumeAllowed: result.status === "running",
  }, null, 2));
}

main();
