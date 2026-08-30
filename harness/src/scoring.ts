// harness/src/scoring.ts
//
// visible tests + H(G) + task-specific tests を実行し、結果を集計する。
//
// アーキテクチャ:
// - 各世代で「修正後リポジトリ」を一時ディレクトリへコピーし、
//   その場で jest を実行する。
// - synthetic-world の node_modules をシンボリックリンクで再利用する。
// - jest の --json --outputFile オプションで結果をファイルに書き出し、
//   spawnSync で同期的に実行してから読み込む。
//
// protocol_adapter.ts の契約違反検出（docs/harness_stage0_plan.md 2.2節）:
// H(G) テストが import エラーで落ちた場合、それ自体を契約違反として記録する。

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { TestSuiteResult, TestCaseResult } from "./types";

// ---- 公開API ----

export interface ScoringResult {
  visibleTests: TestSuiteResult;
  hiddenTests: TestSuiteResult;
  taskSpecificTests: TestSuiteResult | null;
  protocolContractViolated: boolean;
}

/**
 * 修正後リポジトリに対して visible tests と H(G)、task-specific tests を実行する。
 *
 * @param repositoryFiles 完全なリポジトリファイル群（path relative to repository/）
 * @param syntheticWorldDir synthetic-world ディレクトリへの絶対パス
 * @param taskSpecificTestCode タスク固有テストコード文字列（省略可）
 */
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

    // task-specific テスト: テストコードを一時ファイルに書き出して実行
    let taskSpecificTests: TestSuiteResult | null = null;
    if (taskSpecificTestCode) {
      const testDir = path.join(tmpDir, "task_specific_tests");
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, "task.test.ts"), taskSpecificTestCode, "utf8");
      taskSpecificTests = runJest(tmpDir, syntheticWorldDir, "task-specific", "task_specific_tests");
    }

    // 契約違反: H(G) が import エラーで全滅した場合を検出
    const protocolContractViolated = detectProtocolViolation(hiddenTests);

    return { visibleTests, hiddenTests, taskSpecificTests, protocolContractViolated };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---- 内部実装 ----

/**
 * 一時ワークスペースを構築する。
 * synthetic-world と同じディレクトリ構造を tmpDir に作り、
 * リポジトリファイルを修正後のものに差し替える。
 */
function setupWorkspace(
  tmpDir: string,
  repositoryFiles: Record<string, string>,
  syntheticWorldDir: string
): void {
  // 1. schema.ts をコピー（protocol_adapter.ts が ../../schema でimportする）
  copyFile(
    path.join(syntheticWorldDir, "schema.ts"),
    path.join(tmpDir, "schema.ts")
  );

  // 2. jest.config.js をコピー
  copyFile(
    path.join(syntheticWorldDir, "jest.config.js"),
    path.join(tmpDir, "jest.config.js")
  );

  // 3. tsconfig.json を書く（シンプル版、tmpDir 内の全.tsファイルを対象）
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
  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2)
  );

  // 4. node_modules をシンボリックリンクで参照
  const nodeModulesLink = path.join(tmpDir, "node_modules");
  const nodeModulesTarget = path.join(syntheticWorldDir, "node_modules");
  if (!fs.existsSync(nodeModulesLink)) {
    fs.symlinkSync(nodeModulesTarget, nodeModulesLink, "dir");
  }

  // 5. 修正後リポジトリファイルを書き込む
  for (const [relPath, content] of Object.entries(repositoryFiles)) {
    const absPath = path.join(tmpDir, "repository", relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf8");
  }

  // 6. H(G) テストをコピー（評価ハーネス側のファイル。修正不可）
  const hiddenTestSrc = path.join(syntheticWorldDir, "hidden_regression_tests");
  const hiddenTestDst = path.join(tmpDir, "hidden_regression_tests");
  copyDirRecursive(hiddenTestSrc, hiddenTestDst);
}

/**
 * jest を subprocess として実行し、結果を返す。
 */
function runJest(
  tmpDir: string,
  syntheticWorldDir: string,
  label: string,
  testPathPattern: string
): TestSuiteResult {
  const jestBin = path.join(syntheticWorldDir, "node_modules", ".bin", "jest");
  const resultsFile = path.join(tmpDir, `jest-results-${label}.json`);

  const args = [
    "--json",
    `--outputFile=${resultsFile}`,
    `--testPathPattern=${testPathPattern}`,
    "--passWithNoTests",
    "--forceExit",
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
    return makeExecutionError(
      `jest did not produce output file. stderr: ${stderr}\nstdout: ${stdout}`
    );
  }

  try {
    const raw = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
    return parseJestResults(raw);
  } catch (e) {
    return makeExecutionError(`Failed to parse jest results JSON: ${e}`);
  }
}

function parseJestResults(raw: unknown): TestSuiteResult {
  // jest --json 出力のスキーマ（主要フィールドのみ）
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
    // suite-levelの失敗（TypeScriptコンパイルエラー等でテスト自体が実行されなかった場合）
    // assertionResultsが空でstatus=failedのとき、suite.messageにエラー内容が入っている
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

/**
 * H(G) テストが全件失敗かつ import エラーを含む場合、
 * protocol_adapter.ts の契約違反と判定する。
 */
function detectProtocolViolation(hiddenTests: TestSuiteResult): boolean {
  if (hiddenTests.executionError) {
    // jest 起動失敗は契約違反とは区別する
    return false;
  }
  if (hiddenTests.numPassed > 0) {
    // 1つでも通っていれば import はできている
    return false;
  }
  // 全失敗かつ import / syntax エラーを示すメッセージが含まれるか確認
  const allErrors = hiddenTests.testCases
    .flatMap((tc) => tc.error ?? "")
    .join("\n");

  return (
    hiddenTests.numFailed > 0 &&
    (allErrors.includes("Cannot find module") ||
      allErrors.includes("SyntaxError") ||
      allErrors.includes("TypeError: Cannot read") ||
      allErrors.includes("is not a function") ||
      allErrors.includes("has no exported member"))
  );
}

// ---- ファイルユーティリティ ----

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
