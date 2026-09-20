from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

# 1) Shared package-version resolver. Avoid package.json deep-imports blocked by exports.
package_version = '''import * as fs from "fs";
import * as path from "path";

/** Resolve an installed package version without requiring <package>/package.json. */
export function getPackageVersion(packageName: string): string | null {
  try {
    let current = path.dirname(require.resolve(packageName));
    while (true) {
      const candidate = path.join(current, "package.json");
      if (fs.existsSync(candidate)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { name?: string; version?: string };
          if (pkg.name === packageName && typeof pkg.version === "string" && pkg.version.length > 0) {
            return pkg.version;
          }
        } catch {
          // A parent package.json may be unrelated or malformed; keep walking upward.
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    return null;
  }
  return null;
}
'''
(ROOT / "harness/src/agent-backend/package-version.ts").write_text(package_version, encoding="utf-8")

shared_path = ROOT / "harness/src/agent-backend/openai/shared.ts"
shared = shared_path.read_text(encoding="utf-8")
old_get = '''export function getPackageVersion(packageName: string): string | null {\n  try {\n    const pkg = require(`${packageName}/package.json`) as { version?: string };\n    return pkg.version ?? null;\n  } catch {\n    return null;\n  }\n}\n'''
if old_get not in shared:
    raise SystemExit("openai/shared.ts getPackageVersion anchor missing")
shared = shared.replace(old_get, 'export { getPackageVersion } from "../package-version";\n', 1)
shared_path.write_text(shared, encoding="utf-8")

anthropic_path = ROOT / "harness/src/agent-backend/anthropic.ts"
anthropic = anthropic_path.read_text(encoding="utf-8")
anchor = 'import { AgentBackend, AgentInput, AgentResult } from "./types";\n'
if 'from "./package-version"' not in anthropic:
    anthropic = anthropic.replace(anchor, anchor + 'import { getPackageVersion } from "./package-version";\n', 1)
old_anth = '''\nfunction getPackageVersion(packageName: string): string | null {\n  try {\n    const pkg = require(`${packageName}/package.json`) as { version?: string };\n    return pkg.version ?? null;\n  } catch {\n    return null;\n  }\n}\n'''
if old_anth not in anthropic:
    raise SystemExit("anthropic.ts getPackageVersion anchor missing")
anthropic = anthropic.replace(old_anth, "\n", 1)
anthropic_path.write_text(anthropic, encoding="utf-8")

# 2) Held-out invariant task coverage repair, preserving the rest of the JSON byte-for-byte.
task_path = ROOT / "synthetic-world/heldout_tasks.json"
raw = task_path.read_text(encoding="utf-8")
tasks = json.loads(raw)
by_id = {t["taskId"]: t for t in tasks}

def replace_test(code: str, title: str, replacement: str) -> str:
    pattern = re.compile(r'  test\("' + re.escape(title) + r'", \(\) => \{\n.*?\n  \}\);\n', re.S)
    code2, n = pattern.subn(replacement.rstrip() + "\n", code, count=1)
    if n != 1:
        raise SystemExit(f"test block not found exactly once: {title}")
    return code2

def patch_task(task_id: str, transform):
    global raw
    task = by_id[task_id]
    old_code = task["taskSpecificTestCode"]
    new_code = transform(old_code)
    if new_code == old_code:
        raise SystemExit(f"no taskSpecificTestCode change for {task_id}")
    old_json = json.dumps(old_code, ensure_ascii=False)
    new_json = json.dumps(new_code, ensure_ascii=False)
    if raw.count(old_json) != 1:
        raise SystemExit(f"serialized task code anchor mismatch for {task_id}: {raw.count(old_json)}")
    raw = raw.replace(old_json, new_json, 1)
    task["taskSpecificTestCode"] = new_code

patch_task("T-invariant-stress-1", lambda code: replace_test(
    code,
    "fastTrackZef: fails when Tal=nim (Invariant I2 guard)",
    '''  test("fastTrackZef: fails when Tal=nim (Fen=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceOsk1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r2 = protocol.applyOperation(world, "advanceFen1");
    expect(r2.success).toBe(true);
    if (!r2.success) throw new Error(r2.error);
    world = r2.newState;
    const r = protocol.applyOperation(world, "fastTrackZef");
    expect(r.success).toBe(false);
  });

  test("fastTrackZef: fails when Fen=nim (Tal=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceTal1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r = protocol.applyOperation(world, "fastTrackZef");
    expect(r.success).toBe(false);
  });'''))

patch_task("T-invariant-stress-2", lambda code: replace_test(
    code,
    "jumpFen: fails when Osk=nim (Invariant I3 guard)",
    '''  test("jumpFen: fails when Osk=nim (Tal=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceTal1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r = protocol.applyOperation(world, "jumpFen");
    expect(r.success).toBe(false);
  });

  test("jumpFen: fails when Tal=nim (Osk=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceOsk1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r = protocol.applyOperation(world, "jumpFen");
    expect(r.success).toBe(false);
  });'''))

patch_task("T-invariant-stress-3", lambda code: replace_test(
    code,
    "rushZefFen: fails when Tal=nim (Invariants I2+I6 guard)",
    '''  test("rushZefFen: fails when Tal=nim (Osk=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceOsk1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r = protocol.applyOperation(world, "rushZefFen");
    expect(r.success).toBe(false);
  });

  test("rushZefFen: fails when Osk=nim (Tal=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceTal1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r = protocol.applyOperation(world, "rushZefFen");
    expect(r.success).toBe(false);
  });'''))

def patch_inv4(code: str) -> str:
    marker = '  test("turboVokZef: Tal and Osk remain pex after operation", () => {'
    if marker not in code:
        raise SystemExit("T-invariant-stress-4 insertion marker missing")
    block = '''  test("turboVokZef: fails when Osk=nim (Tal=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceTal1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r2 = protocol.applyOperation(world, "advanceVok1");
    expect(r2.success).toBe(true);
    if (!r2.success) throw new Error(r2.error);
    world = r2.newState;
    const r3 = protocol.applyOperation(world, "advanceZef1");
    expect(r3.success).toBe(true);
    if (!r3.success) throw new Error(r3.error);
    world = r3.newState;
    const r = protocol.applyOperation(world, "turboVokZef");
    expect(r.success).toBe(false);
  });

'''
    return code.replace(marker, block + marker, 1)
patch_task("T-invariant-stress-4", patch_inv4)

patch_task("T-invariant-stress-5", lambda code: replace_test(
    code,
    "advanceVokSkip: fails when Tal=nim (Invariant I1 guard)",
    '''  test("advanceVokSkip: fails when Tal=nim (Osk=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceOsk1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r2 = protocol.applyOperation(world, "advanceVok1");
    expect(r2.success).toBe(true);
    if (!r2.success) throw new Error(r2.error);
    world = r2.newState;
    const r = protocol.applyOperation(world, "advanceVokSkip");
    expect(r.success).toBe(false);
  });

  test("advanceVokSkip: fails when Osk=nim (Tal=pex)", () => {
    let world = protocol.reset();
    const r1 = protocol.applyOperation(world, "advanceTal1");
    expect(r1.success).toBe(true);
    if (!r1.success) throw new Error(r1.error);
    world = r1.newState;
    const r2 = protocol.applyOperation(world, "advanceVok1");
    expect(r2.success).toBe(true);
    if (!r2.success) throw new Error(r2.error);
    world = r2.newState;
    const r = protocol.applyOperation(world, "advanceVokSkip");
    expect(r.success).toBe(false);
  });'''))

task_path.write_text(raw, encoding="utf-8")

# 3) Permanent regression checks.
verify_pkg = '''import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { getPackageVersion } from "./src/agent-backend/package-version";

const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package-lock.json"), "utf8"));
const expectedOpenAI = lock.packages?.["node_modules/openai"]?.version;
assert.equal(typeof expectedOpenAI, "string", "openai version missing from package-lock.json");
const actualOpenAI = getPackageVersion("openai");
assert.equal(actualOpenAI, expectedOpenAI, `OpenAI SDK version mismatch: ${actualOpenAI} !== ${expectedOpenAI}`);
assert.match(actualOpenAI!, /^\\d+\\.\\d+\\.\\d+(?:[-+].*)?$/);

const expectedAnthropic = lock.packages?.["node_modules/@anthropic-ai/sdk"]?.version;
const actualAnthropic = getPackageVersion("@anthropic-ai/sdk");
assert.equal(typeof actualAnthropic, "string", "Anthropic SDK version should also resolve through package main entry");
if (typeof expectedAnthropic === "string") assert.equal(actualAnthropic, expectedAnthropic);

console.log(`Package version resolution verified: openai=${actualOpenAI}, anthropic=${actualAnthropic}`);
'''
(ROOT / "harness/verify-package-version.ts").write_text(verify_pkg, encoding="utf-8")

verify_coverage = '''import assert from "assert";
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
  const flawedJumpFen = oracleJumpFen.replace(
    /  if \(world\.tal !== "pex"\) \{[\\s\\S]*?  \}\n/,
    ""
  );
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
'''
(ROOT / "harness/verify-heldout-invariant-coverage.ts").write_text(verify_coverage, encoding="utf-8")

# Package scripts.
pkg_path = ROOT / "harness/package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
scripts = pkg["scripts"]
scripts["verify:package-version"] = "ts-node verify-package-version.ts"
scripts["verify:heldout-invariant-coverage"] = "ts-node verify-heldout-invariant-coverage.ts"
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 4) Stage 1 plan completion record.
stage_path = ROOT / "docs/stage1_plan.md"
stage = stage_path.read_text(encoding="utf-8")
marker = "### 10.2 P6-2：AF baseline"
if marker not in stage:
    raise SystemExit("stage1 P6-2 marker missing")
record = '''### 10.1.5 P6-1b completion record（2026-09-20）

GPT-5.6 Luna / reasoning=`high` / Artifact-Fullで、pilot済み5 taskを除く15 taskのfull-bank eligibilityを実行した。initial phaseは事前計画どおり **45 repeat（15×3）で停止**し、infrastructure-invalid=0、artifact欠損=0、`pending=[]`だった。したがってhold-continuationは明示起動したが追加repeatは0であり、結果を見た後のthreshold変更・task選別は行っていない。P6-1b総costは **$0.149019**。

最終20-task bankは次でfreezeする。

- primary（`eligible ∩ main`）：12
- eligible diagnostic：2
- semantic-floor：6
- AF-unstable：0
- invalid：0
- pending：0

semantic-floor 6 taskは、`T-local-1`, `T-crosscut-2`, `T-invariant-stress-2`, `T-invariant-stress-4`, `T-invariant-stress-5`, `T-crosscut-6`。これはStage 0.5 / Claude HaikuでFullを含む高budget域においてfloorだった6-task集合と**完全一致**した。したがって「どのtaskがAFでもfloorになるか」というtask-set levelではモデル横断的な再現が得られた。一方、**各taskの具体的失敗機序までHaikuとLunaで同一だったとは扱わない**。mechanism-level同一性は別途個別artifactを比較して検証する必要がある。

P6-1b完了後のtask-bank auditで、`T-invariant-stress-2`を含む複数のinvariant-stressing taskに、複数preconditionの片側だけを落としたisolated negative testが不足していることを確認した。これはP6-1bの既存resultを事後的に無効化するものではなく、**P6-1b完了後に発見されたtask-bank coverage改善**として扱う。P6-1b result / freeze判断は当時のfrozen task-bank SHAとともに保持し、P6-2以降では改善後task bankを用いる。

'''
stage = stage.replace(marker, record + marker, 1)
stage_path.write_text(stage, encoding="utf-8")

# 5) Stage 1 findings (F14/F15).
findings_path = ROOT / "docs/findings/stage1_findings.md"
findings = '''# Stage 1 Findings

## F14: P6-1b full task-bank eligibility完了と6-task floor recurrence

**日付**: 2026-09-20  
**Phase**: Pre-Stage 1 P6-1b  
**Model**: GPT-5.6 Luna / reasoning=`high` / Artifact-Full

P6-1 pilot済み5 taskを除く15 taskを3 repeatずつ評価し、initial 45 repeatを事前計画どおり完了した。実行健全性は infrastructure-invalid=0 / artifact missing=0 / `pending=[]`。hold-continuationは完了状態へ遷移するため明示起動したが、追加repeatは0だった。最終bankは primary 12 / eligible diagnostic 2 / semantic-floor 6 / AF-unstable 0 / invalid 0。

semantic-floorは以下の6 taskである。

- `T-local-1`
- `T-crosscut-2`
- `T-invariant-stress-2`
- `T-invariant-stress-4`
- `T-invariant-stress-5`
- `T-crosscut-6`

この集合はStage 0.5のClaude HaikuでFullを含む高budget域においてbudget-independent floorだった6 taskと完全一致した。よって、**floor task集合の再現性はmodelをまたいで観測された**。ただしこれはtask-set levelのrecurrenceであり、HaikuとLunaが各taskで同じ誤推論・同じguard欠落を起こしたことを意味しない。mechanism-levelの一致は未確認であり、個別のgenerated patch / failure reasonを比較するまで断定しない。

## F15: invariant-stressing task-specific testのdependency-isolation coverage gap

**日付**: 2026-09-20  
**Phase**: P6-1b postflight task-bank audit

`T-invariant-stress-2`のground truthは`jumpFen`に `Osk=pex` と `Tal=pex` の両方を要求する。しかし旧task-specific suiteのnegative testは`Osk=nim`だけで、しかもreset直後を使うため`Tal`も同時に`nim`だった。hidden regressionのI6検査は既存`advanceFen2`経路を対象としており、新operation `jumpFen`のTal guard欠落を直接検査しない。そのため、`Osk`だけをguardし`Tal`依存を落とした`jumpFen`がtask-specific coverageをすり抜ける余地があった。

横断監査すると同型の非対称性が`T-invariant-stress-1/3/5`にもあり、`T-invariant-stress-4`ではdependencyそのものをisolatedに落とすnegative testがなかった。そこで、public `WorldProtocol`で到達可能な範囲について、他方のdependencyを満たしたまま片側だけ`nim`にするisolated negative casesを追加した。

- `T-invariant-stress-1`: Tal-only failure / Fen-only failureを分離
- `T-invariant-stress-2`: Osk-only failure / **Tal-only failure (`jumpFen: fails when Tal=nim (Osk=pex)`)** を分離
- `T-invariant-stress-3`: Tal-only failure / Osk-only failureを分離
- `T-invariant-stress-4`: Osk-only failureを追加。Tal-only failureは、base worldでは`Zef=pex`への到達自体が`advanceZef1`の`Tal=pex`を要求するため、public protocol上のreachable stateとして独立構成できない。このケースを「test欠落」と「到達不能な反例」を混同しない。
- `T-invariant-stress-5`: Tal-only failure / Osk-only failureを分離

さらに、oracle `jumpFen`からTal guardだけを除いたmock実装を構成し、新しい`T-invariant-stress-2` Tal-isolation testがその実装をfailさせることをoffline regressionで固定した。

この修正は**P6-1b既存resultを無効化しない**。P6-1bは当時freeze済みのtask bankに対する結果として保持し、本修正はP6-2以降のtask bank品質改善としてversion/provenance上区別して扱う。
'''
findings_path.write_text(findings, encoding="utf-8")

print("P6 postflight patch staged")
