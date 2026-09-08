// harness/src/scoring.ts
//
// visible tests + H(G) + task-specific tests を実行し、結果を集計する。

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { TestSuiteResult, TestCaseResult } from "./types";
import { normalizeRepositoryRelativePath } from "./repository/path-guard";

export interface ScoringResult {
  visibleTests: TestSuiteResult;
  hiddenTests: TestSuiteResult;
  taskSpecificTests: TestSuiteResult | null;
  protocolContractViolated: boolean;
}

export async function runScoring(
  repositoryFiles: Record<string, string>,
  syntheticWorldDir: string,
  taskSpecificTestCode?: string
): Promise<ScoringResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-ilm-scoring-"));

  try {
    setupWorkspace(tmpDir, repositoryFiles, syntheticWorldDir);

    const visibleTests = runJest(tmpDir, syntheticWorldDir, "visible", "repository/tests");
    const hiddenTests = runJest(tmpDir, syntheticWorldDir, "hidden", "hidden_regression_tests");

    let taskSpecificTests: TestSuiteResult | null = null;
    if (taskSpecificTestCode) {
      const testDir = path.join(tmpDir, "task_specific_tests");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "task.test.ts"), taskSpecificTestCode, "utf8");
      taskSpecificTests = runJest(tmpDir, syntheticWorldDir, "task-specific", "task_specific_tests");
    }

    const protocolContractViolated = detectProtocolViolation(hiddenTests);
    return { visibleTests, hiddenTests, taskSpecificTests, protocolContractViolated };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function setupWorkspace(
  tmpDir: string,
  repositoryFiles: Record<string, string>,
  syntheticWorldDir: string
): void {
  copyFile(path.join(syntheticWorldDir, "schema.ts"), path.join(tmpDir, "schema.ts"));
  copyFile(path.join(syntheticWorldDir, "jest.config.js"), path.join(tmpDir, "jest.config.js"));

  const tsconfig = {
    compilerOptions: {
      target: "ES2020",
      module: "commonjs",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ["**/*.ts"],
    exclude: ["node_modules"],
  };
  fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

  const nodeModulesLink = path.join(tmpDir, "node_modules");
  const nodeModulesTarget = path.join(syntheticWorldDir, "node_modules");
  if (!fs.existsSync(nodeModulesLink)) {
    fs.symlinkSync(nodeModulesTarget, nodeModulesLink, "dir");
  }

  // Agent merge境界とは独立に、filesystem write境界でもpathを再検証する。
  for (const [relPath, content] of Object.entries(repositoryFiles)) {
    const safeRelPath = normalizeRepositoryRelativePath(relPath);
    const repositoryRoot = path.join(tmpDir, "repository");
    const absPath = path.join(repositoryRoot, safeRelPath);
    const resolved = path.resolve(absPath);
    const resolvedRoot = path.resolve(repositoryRoot) + path.sep;
    if (!resolved.startsWith(resolvedRoot)) {
      throw new Error(`Scoring path escaped repository root: ${relPath}`);
    }
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf8");
  }

  const hiddenTestSrc = path.join(syntheticWorldDir, "hidden_regression_tests");
  const hiddenTestDst = path.join(tmpDir, "hidden_regression_tests");
  copyDirRecursive(hiddenTestSrc, hiddenTestDst);
}

function runJest(
  tmpDir: string,
  syntheticWorldDir: string,
  label: string,
  testPathPattern: string
): TestSuiteResult {
  const jestBin = path.join(syntheticWorldDir, "node_modules", ".bin", "jest");
  const resultsFile = path.join(tmpDir, `jest-results-${label}.json`);
  const cacheDir = path.join(syntheticWorldDir, ".jest-cache");
  const args = [
    "--json",
    `--outputFile=${resultsFile}`,
    `--testPathPattern=${testPathPattern}`,
    "--passWithNoTests",
    "--forceExit",
    `--cacheDirectory=${cacheDir}`,
  ];

  const result = spawnSync(jestBin, args, {
    cwd: tmpDir,
    encoding: "utf8",
    timeout: 120_000,
  });

  if (result.error) {
    return makeExecutionError(`jest process error: ${result.error.message}`);
  }

  if (!fs.existsSync(resultsFile)) {
    const stderr = result.stderr?.slice(0, 2000) ?? "";
    const stdout = result.stdout?.slice(0, 2000) ?? "";
    return makeExecutionError(`jest did not produce output file. stderr: ${stderr}\nstdout: ${stdout}`);
  }

  try {
    const raw = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
    return parseJestResults(raw);
  } catch (e) {
    return makeExecutionError(`Failed to parse jest results JSON: ${e}`);
  }
}

function parseJestResults(raw: unknown): TestSuiteResult {
  type JestOutput = {
    success: boolean;
    numPassedTests: number;
    numFailedTests: number;
    testResults: Array<{
      testFilePath: string;
      status: "passed" | "failed" | "pending";
      message: string;
      assertionResults: Array<{
        fullName: string;
        status: "passed" | "failed" | "pending";
        failureMessages: string[];
      }>;
    }>;
  };

  const j = raw as JestOutput;
  const testCases: TestCaseResult[] = [];
  let suiteLevelFailures = 0;

  for (const suite of j.testResults ?? []) {
    if (suite.status === "failed" && (suite.assertionResults ?? []).length === 0) {
      suiteLevelFailures++;
      testCases.push({
        testName: `[suite] ${suite.testFilePath}`,
        passed: false,
        error: suite.message || "Test suite failed to run",
      });
    }
    for (const tc of suite.assertionResults ?? []) {
      testCases.push({
        testName: tc.fullName,
        passed: tc.status === "passed",
        error: tc.failureMessages?.join("\n") || undefined,
      });
    }
  }

  return {
    passed: j.success,
    numPassed: j.numPassedTests ?? 0,
    numFailed: (j.numFailedTests ?? 0) + suiteLevelFailures,
    testCases,
    rawJestOutput: raw,
  };
}

function makeExecutionError(message: string): TestSuiteResult {
  return {
    passed: false,
    numPassed: 0,
    numFailed: 1,
    testCases: [],
    rawJestOutput: null,
    executionError: message,
  };
}

function detectProtocolViolation(hiddenTests: TestSuiteResult): boolean {
  if (hiddenTests.executionError || hiddenTests.numPassed > 0) {
    return false;
  }

  const allErrors = hiddenTests.testCases.flatMap((tc) => tc.error ?? "").join("\n");
  return (
    hiddenTests.numFailed > 0 &&
    (allErrors.includes("Cannot find module") ||
      allErrors.includes("SyntaxError") ||
      allErrors.includes("TypeError: Cannot read") ||
      allErrors.includes("is not a function") ||
      allErrors.includes("has no exported member") ||
      (allErrors.includes("protocol_adapter.ts") && /TS\d{4}/.test(allErrors)))
  );
}

function copyFile(src: string, dst: string): void {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDirRecursive(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
