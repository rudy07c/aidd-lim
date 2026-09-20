import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { runScoring } from "./src/scoring";
import { applyOracle as applyJumpFenOracle } from "./fixtures/oracle-patches/T-invariant-stress-2";

type HeldOutTask = {
  taskId: string;
  type: string;
  taskSpecificTestCode: string;
  groundTruthDelta: { addTransitions?: Array<{ preconditions?: Array<{ entity: string; state: string }> }> };
};

const syntheticWorldDir = path.resolve(__dirname, "../synthetic-world");
const tasks = JSON.parse(fs.readFileSync(path.join(syntheticWorldDir, "heldout_tasks.json"), "utf8")) as HeldOutTask[];
const invariantTasks = tasks.filter((task) => task.type === "invariant_stressing");
assert.equal(invariantTasks.length, 5, "expected five invariant_stressing tasks");

const expectedIsolatedNegativeTitles: Record<string, string[]> = {
  "T-invariant-stress-1": ["fails when Tal=nim (Fen=pex)", "fails when Fen=nim (Tal=pex)"],
  "T-invariant-stress-2": ["fails when Osk=nim (Tal=pex)", "fails when Tal=nim (Osk=pex)"],
  "T-invariant-stress-3": ["fails when Tal=nim (Osk=pex)", "fails when Osk=nim (Tal=pex)"],
  // Tal=nim cannot be isolated while Zef=pex through the public protocol because advanceZef1 itself requires Tal=pex.
  "T-invariant-stress-4": ["fails when Osk=nim (Tal=pex)"],
  "T-invariant-stress-5": ["fails when Tal=nim (Osk=pex)", "fails when Osk=nim (Tal=pex)"],
};

for (const task of invariantTasks) {
  const expectations = expectedIsolatedNegativeTitles[task.taskId];
  assert(expectations, `missing audit policy for ${task.taskId}`);
  for (const title of expectations) {
    assert(task.taskSpecificTestCode.includes(title), `${task.taskId} missing isolated dependency test: ${title}`);
  }
  const preconditions = (task.groundTruthDelta.addTransitions ?? []).flatMap((t) => t.preconditions ?? []);
  assert(preconditions.length >= 2, `${task.taskId} should remain an invariant-stressing multi-dependency task`);
}

async function verifyJumpFenTalGapDetection(): Promise<void> {
  const task = tasks.find((item) => item.taskId === "T-invariant-stress-2");
  assert(task, "T-invariant-stress-2 missing");
  const repository = loadRepository(path.join(syntheticWorldDir, "repository"));
  const oracle = { ...repository, ...applyJumpFenOracle(repository) };
  const oracleJumpFen = oracle["src/fen/jumpFen.ts"];
  assert(oracleJumpFen, "oracle jumpFen patch missing");
  const talGuard = `  if (world.tal !== "pex") {
    throw new Error("jumpFen: requires Tal to be 'pex' (Invariant I6 guard)");
  }
`;
  const flawedJumpFen = oracleJumpFen.replace(talGuard, "");
  assert.notEqual(flawedJumpFen, oracleJumpFen, "failed to construct Tal-guard-omitting mock");
  const flawed = { ...oracle, "src/fen/jumpFen.ts": flawedJumpFen };
  const scoring = await runScoring(flawed, syntheticWorldDir, task.taskSpecificTestCode);
  assert(scoring.taskSpecificTests, "task-specific suite missing");
  const target = scoring.taskSpecificTests.testCases.find((tc) => tc.testName.includes("jumpFen: fails when Tal=nim (Osk=pex)"));
  assert(target, "new Tal-isolation test was not executed");
  assert.equal(target.passed, false, "Tal-guard-omitting implementation must be detected");
  console.log("T-invariant-stress-2 Tal dependency omission is detected by the new task-specific test.");
}

function loadRepository(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  walk(root, root, files);
  return files;
}

function walk(root: string, current: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const abs = path.join(current, entry.name);
    if (entry.isDirectory()) walk(root, abs, out);
    else if (entry.isFile()) out[path.relative(root, abs).split(path.sep).join("/")] = fs.readFileSync(abs, "utf8");
  }
}

verifyJumpFenTalGapDetection().then(() => {
  console.log("Invariant task coverage audit verified; T-invariant-stress-4 Tal-isolation is explicitly unreachable through public WorldProtocol.");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
