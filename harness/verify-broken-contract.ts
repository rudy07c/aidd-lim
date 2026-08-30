// harness/verify-broken-contract.ts
//
// Phase 2 検証: protocol_adapter.ts の契約違反検出が正しく機能するかを確認する。
//
// 正常な repository ファイル群を読み込み、protocol_adapter.ts を
// 意図的に壊した版（`protocol` エクスポートを削除）に差し替えて
// runScoring() を呼び出す。
//
// 期待:
//   - H(G) が import エラーで失敗する
//   - protocolContractViolated: true が返る
//   - クラッシュせず正常終了する

import * as fs from "fs";
import * as path from "path";
import { runScoring } from "./src/scoring";

async function main(): Promise<void> {
  const harnessDir = __dirname;
  const syntheticWorldDir = path.join(path.dirname(harnessDir), "synthetic-world");
  const repositoryDir = path.join(syntheticWorldDir, "repository");

  // 元のリポジトリファイルを読み込む
  const repositoryFiles: Record<string, string> = {};
  loadDirRecursive(repositoryDir, repositoryDir, repositoryFiles);

  console.log(`Loaded ${Object.keys(repositoryFiles).length} repository files.`);

  // protocol_adapter.ts を意図的に壊す: `protocol` エクスポートを別名に変更
  // H(G) は `import { protocol }` を期待するため、"has no exported member" エラーになる
  const broken = repositoryFiles["src/protocol_adapter.ts"].replace(
    "export const protocol:",
    "export const BROKEN_DO_NOT_USE:"
  );
  const brokenFiles = { ...repositoryFiles, "src/protocol_adapter.ts": broken };

  console.log("\n[verify-broken-contract] Running scoring with broken protocol_adapter.ts...");

  const result = await runScoring(brokenFiles, syntheticWorldDir);

  console.log(`\n--- Results ---`);
  console.log(`Visible tests:  ${result.visibleTests.numPassed} passed / ${result.visibleTests.numFailed} failed`);
  console.log(`Hidden tests:   ${result.hiddenTests.numPassed} passed / ${result.hiddenTests.numFailed} failed`);
  console.log(`protocolContractViolated: ${result.protocolContractViolated}`);

  // 失敗したテストのエラーを表示（最初の1件だけ）
  const firstFailure = result.hiddenTests.testCases.find((tc) => !tc.passed);
  if (firstFailure?.error) {
    const snippet = firstFailure.error.slice(0, 300);
    console.log(`\nFirst H(G) failure (snippet):\n${snippet}`);
  }

  // 期待値チェック
  const ok =
    result.hiddenTests.numPassed === 0 &&
    result.hiddenTests.numFailed > 0 &&
    result.protocolContractViolated === true;

  console.log(`\n[verify-broken-contract] ${ok ? "PASS" : "FAIL"}: contract violation correctly detected = ${result.protocolContractViolated}`);

  process.exit(ok ? 0 : 1);
}

function loadDirRecursive(baseDir: string, currentDir: string, result: Record<string, string>): void {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      loadDirRecursive(baseDir, fullPath, result);
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      result[relPath] = fs.readFileSync(fullPath, "utf8");
    }
  }
}

main().catch((e) => {
  console.error("[verify-broken-contract] CRASHED:", e);
  process.exit(1);
});
