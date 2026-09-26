import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

const V1_ARCHIVE_BASENAME = "p6-3-v1-diagnostic-2026-09-26.tar.gz";
const V1_ARCHIVE_SHA256 = "09c58838f2396ceeabe54f8843b922dee2849d57994843d9a714afcd08debb94";
const V1_RUN_MEMBER_PREFIX =
  "runs/_calibration/p6-3-el-calibration-luna__2026-09-26T09-49-02-071Z";
const V1_CHECKOUT_SHA = "b60b3560a163dfcedf07ffd1dbacc29ed4cf3b7f";
const V1_MANIFEST_HASHES = Object.freeze({
  structuralFreeze: "2f26b34f112b4b1ffcf9fd979cdafff20c146bc4236f4a26d5fa72f3ec5f5196",
  executionProtocol: "ea72d6461a3ba1589a221864e8f9b9dc57174bbbf1bba9e87a77c26474c43408",
  mutationParity: "fb5c87779390204ad2555ee9390ef5ebe27884a01a983ba16833e00541e4a840",
  rsemParity: "134e742db585ca3d196016567a61bb8d8cd3a6e0ca66918befd85be5f9aa1e96",
});

const FIXTURE_SCHEMA = "p6-3-v1-auto-infra-regression-fixture-v1";

function main(): void {
  const archiveArg = readArg("--archive");
  if (!archiveArg) {
    throw new Error(
      "Usage: ts-node extract-p6-3-v1-auto-infra-fixture.ts --archive <p6-3-v1-diagnostic-2026-09-26.tar.gz> [--out <fixture.json>]"
    );
  }
  const archivePath = path.resolve(process.cwd(), archiveArg);
  const outPath = path.resolve(
    process.cwd(),
    readArg("--out") ?? "frozen/p6-3-v1-auto-infra-regression.json"
  );

  if (!fs.existsSync(archivePath)) throw new Error(`Archive not found: ${archivePath}`);
  if (path.basename(archivePath) !== V1_ARCHIVE_BASENAME) {
    throw new Error(`Unexpected archive basename: ${path.basename(archivePath)}`);
  }

  const archiveBytes = fs.readFileSync(archivePath);
  const archiveSha256 = sha256(archiveBytes);
  assertEqual(archiveSha256, V1_ARCHIVE_SHA256, "v1 archive SHA-256");

  const members = listTarMembers(archivePath);
  for (const member of members) assertSafeTarMember(member);

  const resultMember = `${V1_RUN_MEMBER_PREFIX}/result.json`;
  requireMember(members, resultMember);
  const resultBytes = readTarMember(archivePath, resultMember);
  const result = parseJson(resultBytes, resultMember) as any;

  assertEqual(result.checkoutGitSha, V1_CHECKOUT_SHA, "checkoutGitSha");
  assertEqual(result.status, "needs-audit", "result.status");
  assertEqual(result.totalLogicalCells, 864, "totalLogicalCells");
  assertEqual(result.cursorCellIndex, 32, "cursorCellIndex");
  assertEqual(result.auditFlag?.kind, "max-infrastructure-attempts-exhausted", "auditFlag.kind");
  assertEqual(result.auditFlag?.sequence, 32, "auditFlag.sequence");
  assertEqual(result.auditFlag?.attempt, 3, "auditFlag.attempt");

  for (const [name, expected] of Object.entries(V1_MANIFEST_HASHES)) {
    assertEqual(result.frozenManifestHashes?.[name], expected, `manifest ${name}`);
  }

  if (!Array.isArray(result.attempts)) throw new Error("v1 result.attempts is not an array");
  assertEqual(result.attempts.length, 43, "scientific attempt count at stop");

  const seen = new Set<string>();
  const cases = result.attempts.map((attempt: any) => {
    const sequence = requireInteger(attempt.sequence, "attempt.sequence");
    const scientificAttempt = requireInteger(attempt.attempt, "attempt.attempt");
    const identity = `${sequence}:${scientificAttempt}`;
    if (seen.has(identity)) throw new Error(`Duplicate attempt identity: ${identity}`);
    seen.add(identity);

    const artifactPath = requireString(attempt.artifactPath, `artifactPath ${identity}`);
    const artifactMember = `${V1_RUN_MEMBER_PREFIX}/${artifactPath}`;
    requireMember(members, artifactMember);
    const artifactBytes = readTarMember(archivePath, artifactMember);
    const artifact = parseJson(artifactBytes, artifactMember) as any;
    const agent = artifact?.payload?.agent;
    if (!agent || typeof agent !== "object") {
      throw new Error(`Missing payload.agent in ${artifactMember}`);
    }

    const artifactExecutionStatus = nullableString(agent.executionStatus);
    const recordExecutionStatus = nullableString(attempt.executionStatus);
    if (artifactExecutionStatus !== recordExecutionStatus) {
      throw new Error(
        `Execution-status mismatch for ${identity}: result=${recordExecutionStatus} artifact=${artifactExecutionStatus}`
      );
    }

    const humanFinalDisposition = nullableString(attempt.adjudication?.finalDisposition);
    const expectedDisposition =
      humanFinalDisposition === "infrastructure-invalid"
        ? "infrastructure-invalid"
        : "not-infrastructure-invalid";

    return {
      identity: {
        sequence,
        measurement: nullableString(attempt.measurement),
        taskId: nullableString(attempt.taskId),
        repeat: requireInteger(attempt.repeat, `attempt.repeat ${identity}`),
        armLabel: nullableString(attempt.armLabel),
        attempt: scientificAttempt,
      },
      sourceArtifactPath: artifactPath,
      sourceArtifactSha256: sha256(artifactBytes),
      recorded: {
        rawFailureDomain: nullableString(attempt.rawFailureDomain),
        effectiveFailureDomain: nullableString(attempt.effectiveFailureDomain),
        humanFinalDisposition,
        reviewer: nullableString(attempt.adjudication?.reviewer),
      },
      rawEvidence: {
        executionStatus: artifactExecutionStatus,
        incompleteReason: nullableString(agent.modelProvenance?.incompleteReason),
        outputTokens: nullableNumber(agent.tokenUsage?.output),
        reasoningOutputTokens: nullableNumber(agent.tokenUsage?.reasoningOutput),
        configuredMaxOutputTokens: nullableNumber(agent.modelProvenance?.maxOutputTokens),
        responseStatus: nullableString(agent.modelProvenance?.responseStatus),
        providerErrorCode: nullableString(agent.modelProvenance?.providerErrorCode),
        errorCategory: nullableString(agent.error?.category),
        errorMessage: nullableString(agent.error?.message),
      },
      expectedAutoDisposition: expectedDisposition,
    };
  });

  const replacementAttemptCount = result.attempts.filter(
    (attempt: any) => Number.isInteger(attempt.attempt) && attempt.attempt > 1
  ).length;
  assertEqual(replacementAttemptCount, 10, "replacement-attempt count at stop");

  const humanInfrastructureInvalidCount = cases.filter(
    (item: any) => item.expectedAutoDisposition === "infrastructure-invalid"
  ).length;
  if (humanInfrastructureInvalidCount < 1) {
    throw new Error("Fixture source contains no human infrastructure-invalid adjudications");
  }

  const sequence32 = cases.filter((item: any) => item.identity.sequence === 32);
  assertEqual(sequence32.length, 3, "sequence 32 attempt count");
  for (const item of sequence32) {
    assertEqual(
      item.expectedAutoDisposition,
      "infrastructure-invalid",
      `sequence 32 attempt ${item.identity.attempt} human disposition`
    );
  }

  const fixture = {
    schemaVersion: FIXTURE_SCHEMA,
    source: {
      archiveBasename: V1_ARCHIVE_BASENAME,
      archiveSha256,
      runMemberPrefix: V1_RUN_MEMBER_PREFIX,
      resultSha256: sha256(resultBytes),
      checkoutGitSha: V1_CHECKOUT_SHA,
      frozenManifestHashes: V1_MANIFEST_HASHES,
    },
    summary: {
      attemptCount: cases.length,
      replacementAttemptCount,
      humanInfrastructureInvalidCount,
      completedLogicalCellsAtStop: result.cursorCellIndex,
      exhaustion: {
        kind: result.auditFlag.kind,
        sequence: result.auditFlag.sequence,
        attempt: result.auditFlag.attempt,
      },
    },
    cases,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      fixture: outPath,
      archiveSha256,
      resultSha256: fixture.source.resultSha256,
      attempts: cases.length,
      replacementAttempts: replacementAttemptCount,
      humanInfrastructureInvalid: humanInfrastructureInvalidCount,
      exhaustion: fixture.summary.exhaustion,
    })
  );
}

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function listTarMembers(archivePath: string): Set<string> {
  const text = execFileSync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Set(
    text
      .split(/\r?\n/)
      .map((value) => value.replace(/\/$/, ""))
      .filter(Boolean)
  );
}

function readTarMember(archivePath: string, member: string): Buffer {
  return execFileSync("tar", ["-xOzf", archivePath, member], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  }) as Buffer;
}

function requireMember(members: Set<string>, member: string): void {
  if (!members.has(member)) throw new Error(`Archive member missing: ${member}`);
}

function assertSafeTarMember(member: string): void {
  if (path.posix.isAbsolute(member) || member.split("/").includes("..")) {
    throw new Error(`Unsafe tar member path: ${member}`);
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

main();
