import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { TaskRepeatLike } from "./failure-classification";
import {
  missingRepeatPlan,
  nextEligibilityRepeatPlan,
  P6_1_INITIAL_REPEATS,
  type RepeatIdentity,
  type TaskIdentity,
} from "./task-bank-eligibility";

export type EligibilityExecutionPhase = "initial" | "hold-continuation";

export const REPEAT_ARTIFACT_FILES = [
  "agent_response.txt",
  "modified_files.json",
  "model_provenance.json",
  "test_results.json",
  "repeat_meta.json",
] as const;

export interface RepeatArtifactBundle {
  rawResponse: string;
  modifiedFiles: Record<string, string>;
  modelProvenance: unknown;
  testResults: unknown;
  agentExecutionStatus: string;
  agentError: unknown;
  runnerError: string | null;
}

export interface ArtifactReconciliation<T extends TaskRepeatLike> {
  repeatResults: T[];
  missingArtifactKeys: string[];
  recoveredArtifactKeys: string[];
}

export function assertTrackedWorktreeClean(repoRoot: string): void {
  const status = childProcess.execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: repoRoot, encoding: "utf8" }
  ).trim();
  if (status) {
    throw new Error(
      `Scientific live run requires a clean tracked worktree. Commit/stash tracked changes first:\n${status}`
    );
  }
}

export function planEligibilityPhase<T extends TaskIdentity>(
  tasks: T[],
  completed: TaskRepeatLike[],
  phase: EligibilityExecutionPhase
): RepeatIdentity[] {
  if (phase === "initial") {
    return missingRepeatPlan(tasks, completed, P6_1_INITIAL_REPEATS);
  }
  assertInitialPhaseComplete(tasks, completed);
  return nextEligibilityRepeatPlan(tasks, completed)
    .filter((item) => item.repeat > P6_1_INITIAL_REPEATS);
}

export function assertInitialPhaseComplete<T extends TaskIdentity>(
  tasks: T[],
  completed: TaskRepeatLike[]
): void {
  const keys = new Set(completed.map((item) => repeatKey(item.taskId, item.repeat)));
  const missing: string[] = [];
  for (const task of tasks) {
    for (let repeat = 1; repeat <= P6_1_INITIAL_REPEATS; repeat++) {
      const key = repeatKey(task.taskId, repeat);
      if (!keys.has(key)) missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `hold-continuation requires a complete initial phase; missing ${missing.length} initial repeat(s): ${missing.slice(0, 10).join(",")}`
    );
  }
}

export function assertResumeManifestEqual(actual: unknown, expected: unknown): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error("Resume refused: frozen execution manifest changed");
  }
}

export function repeatArtifactDirectory(runDir: string, taskId: string, repeat: number): string {
  const safeTaskId = taskId.replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(runDir, safeTaskId, `repeat-${repeat}`);
}

export function repeatArtifactBundleComplete(runDir: string, taskId: string, repeat: number): boolean {
  const dir = repeatArtifactDirectory(runDir, taskId, repeat);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  return REPEAT_ARTIFACT_FILES.every((fileName) => fs.existsSync(path.join(dir, fileName)));
}

export function commitRepeatArtifactsAtomic<T extends TaskRepeatLike>(
  runDir: string,
  repeatResult: T,
  artifacts: RepeatArtifactBundle
): void {
  const target = repeatArtifactDirectory(runDir, repeatResult.taskId, repeatResult.repeat);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmp, "agent_response.txt"), artifacts.rawResponse, "utf8");
    fs.writeFileSync(
      path.join(tmp, "modified_files.json"),
      JSON.stringify(artifacts.modifiedFiles, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "model_provenance.json"),
      JSON.stringify(artifacts.modelProvenance, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "test_results.json"),
      JSON.stringify(artifacts.testResults, null, 2) + "\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "repeat_meta.json"),
      JSON.stringify({
        repeatResult,
        agentExecutionStatus: artifacts.agentExecutionStatus,
        agentError: artifacts.agentError,
        runnerError: artifacts.runnerError,
      }, null, 2) + "\n",
      "utf8"
    );

    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw error;
  }
}

export function reconcileRepeatJournal<T extends TaskRepeatLike>(
  runDir: string,
  recorded: T[]
): ArtifactReconciliation<T> {
  const kept: T[] = [];
  const missingArtifactKeys: string[] = [];
  const recoveredArtifactKeys: string[] = [];
  const seen = new Set<string>();

  for (const item of recorded) {
    const key = repeatKey(item.taskId, item.repeat);
    if (seen.has(key)) throw new Error(`Duplicate repeat in result.json: ${key}`);
    if (repeatArtifactBundleComplete(runDir, item.taskId, item.repeat)) {
      kept.push(item);
      seen.add(key);
    } else {
      missingArtifactKeys.push(key);
      fs.rmSync(repeatArtifactDirectory(runDir, item.taskId, item.repeat), { recursive: true, force: true });
    }
  }

  if (fs.existsSync(runDir)) {
    for (const taskEntry of fs.readdirSync(runDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory()) continue;
      const taskDir = path.join(runDir, taskEntry.name);
      for (const repeatEntry of fs.readdirSync(taskDir, { withFileTypes: true })) {
        if (!repeatEntry.isDirectory()) continue;
        const match = /^repeat-(\d+)$/.exec(repeatEntry.name);
        if (!match) continue;
        const repeatDir = path.join(taskDir, repeatEntry.name);
        const metaPath = path.join(repeatDir, "repeat_meta.json");
        if (!REPEAT_ARTIFACT_FILES.every((name) => fs.existsSync(path.join(repeatDir, name)))) {
          fs.rmSync(repeatDir, { recursive: true, force: true });
          continue;
        }
        let recovered: T;
        try {
          const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          recovered = parsed.repeatResult as T;
        } catch {
          fs.rmSync(repeatDir, { recursive: true, force: true });
          continue;
        }
        if (!recovered || typeof recovered.taskId !== "string" || !Number.isInteger(recovered.repeat)) {
          fs.rmSync(repeatDir, { recursive: true, force: true });
          continue;
        }
        const key = repeatKey(recovered.taskId, recovered.repeat);
        if (!seen.has(key)) {
          kept.push(recovered);
          seen.add(key);
          recoveredArtifactKeys.push(key);
        }
      }
    }
  }

  kept.sort((a, b) => a.taskId.localeCompare(b.taskId) || a.repeat - b.repeat);
  return { repeatResults: kept, missingArtifactKeys, recoveredArtifactKeys };
}

function repeatKey(taskId: string, repeat: number): string {
  return `${taskId}#${repeat}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
