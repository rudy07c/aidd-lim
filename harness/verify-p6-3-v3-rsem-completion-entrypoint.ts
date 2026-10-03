import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  P6_3_V3_RSEM_COMPLETION_PAID_ENV,
} from "./src/p6/p6-3-v3-rsem-completion-controller";
import {
  runP63V3RSemCompletionEntrypoint,
} from "./src/p6/p6-3-v3-rsem-completion-entrypoint";
import {
  finalizeP63V3RSemCompletion,
} from "./src/p6/p6-3-v3-rsem-completion-finalizer";
import {
  runP63V3RSemCompletionFinalPreLiveGate,
} from "./src/p6/p6-3-v3-rsem-completion-final-prelive-gate";
import type {
  P63V3RSemCompletionCell,
} from "./src/p6/p6-3-v3-rsem-completion-plan";
import type {
  P63CellOutcome,
  P63ExposureEvidence,
} from "./src/p6/p6-3-live-calibration-runner";

async function main(): Promise<void> {
  const token =
    runP63V3RSemCompletionFinalPreLiveGate(
      __dirname
    );
  const scratch = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "p6-3-v3-rsem-completion-entrypoint-"
    )
  );

  try {
    const statePath = path.join(
      scratch,
      "run",
      "state.json"
    );
    let calls = 0;
    const executor = {
      execute: async (
        cell: Readonly<P63V3RSemCompletionCell>
      ) => {
        calls += 1;
        return validOutcome(cell);
      },
    };

    const environment = {
      [P6_3_V3_RSEM_COMPLETION_PAID_ENV]:
        "1",
    } as NodeJS.ProcessEnv;

    const first =
      await runP63V3RSemCompletionEntrypoint({
        finalPreLiveToken: token,
        paidAuthorization: true,
        environment,
        resumePath: null,
        adjudicationsPath: null,
        testDependencies: {
          executor,
          newStatePath: statePath,
        },
      });

    assert.equal(first.state.status, "completed");
    assert.equal(
      first.state.executionMode,
      "offline-verifier"
    );
    assert.equal(
      first.state.cursorCollectionSequence,
      72
    );
    assert.equal(
      first.state.attempts.length,
      72
    );
    assert.equal(calls, 72);
    assert.equal(
      first.execution.nextCanonicalV3Sequence,
      null
    );
    assert.equal(
      fs.existsSync(statePath),
      true
    );
    for (const file of [
      "p6-3-v3-rsem-completion-final-prelive-receipt.json",
      "fixed-environment-run.json",
      "rsem-completion-treatment-provenance.json",
    ]) {
      assert.equal(
        fs.existsSync(
          path.join(
            path.dirname(statePath),
            file
          )
        ),
        true,
        `missing persisted ${file}`
      );
    }

    const callsBeforeResume = calls;
    const resumed =
      await runP63V3RSemCompletionEntrypoint({
        finalPreLiveToken: token,
        paidAuthorization: true,
        environment,
        resumePath: statePath,
        adjudicationsPath: null,
        testDependencies: {
          executor: {
            execute: async (cell) => {
              calls += 1;
              return validOutcome(cell);
            },
          },
        },
      });
    assert.equal(
      resumed.state.status,
      "completed"
    );
    assert.equal(
      calls,
      callsBeforeResume
    );

    const repoRoot = path.resolve(
      __dirname,
      ".."
    );
    assert.throws(
      () =>
        finalizeP63V3RSemCompletion({
          repoRoot,
          freshRSemState: resumed.state,
        }),
      /provenance mismatch/
    );

    await assert.rejects(
      () =>
        runP63V3RSemCompletionEntrypoint({
          finalPreLiveToken: token,
          paidAuthorization: false,
          environment,
          resumePath: null,
          adjudicationsPath: null,
          testDependencies: {
            executor,
            newStatePath: path.join(
              scratch,
              "unauthorized",
              "state.json"
            ),
          },
        }),
      /requires explicit/
    );

    console.log(JSON.stringify({
      status: "ok",
      slice:
        "p6-3-v3-rsem-completion-entrypoint",
      providerCallsMade: false,
      firstRunCalls: callsBeforeResume,
      completedResumeAdditionalCalls:
        calls - callsBeforeResume,
      executionMode:
        first.state.executionMode,
      persistedAttempts:
        first.state.attempts.length,
      verified: [
        "final-prelive-token-required",
        "explicit-paid-authorization-required",
        "72-cell-offline-entrypoint-path",
        "completion-provenance-files-persisted",
        "completed-resume-makes-zero-new-calls",
        "offline-executor-state-is-marked-offline-verifier",
        "offline-verifier-state-is-rejected-by-scientific-finalizer",
        "zero-provider-calls",
      ],
    }, null, 2));
  } finally {
    fs.rmSync(scratch, {
      recursive: true,
      force: true,
    });
  }
}

function validOutcome(
  cell: Readonly<P63V3RSemCompletionCell>
): P63CellOutcome {
  return {
    failureDomain: "none",
    executionStatus: "ok",
    passed: null,
    semanticScore: 0.5,
    protocolValid: true,
    estimatedCostUsd: 0.001,
    failureReason: null,
    exposure: exposureFor(cell),
    diagnosticSummary: {
      validity: "valid",
      booleanCorrect: 6,
      booleanTotal: 12,
    },
    artifactPayload: {
      result: {
        validity: "valid",
      },
    },
  };
}

function exposureFor(
  cell: Readonly<P63V3RSemCompletionCell>
): P63ExposureEvidence {
  const fullRepositoryTokens = 4046;
  return {
    mode:
      cell.armKind === "AF"
        ? "AF-full"
        : "EL-static",
    budgetTokens: cell.budgetTokens,
    actualExposedTokens:
      cell.budgetTokens === "full"
        ? fullRepositoryTokens
        : cell.budgetTokens,
    fullRepositoryTokens,
    staticPayloadHash:
      `entrypoint-fixture-${cell.collectionSequence}`,
    exposureSetHash:
      cell.armKind === "AF"
        ? null
        : `entrypoint-set-${cell.collectionSequence}`,
    selectorPlanHash:
      cell.armKind === "AF"
        ? null
        : `entrypoint-selector-${cell.collectionSequence}`,
    selectedUnitCount:
      cell.armKind === "AF" ? null : 1,
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
