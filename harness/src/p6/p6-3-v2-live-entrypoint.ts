import * as fs from "fs";
import * as path from "path";
import {
  buildP63CalibrationPlan,
  type P63CalibrationCell,
} from "./p6-3-live-calibration-runner";
import {
  applyP63V2ManualAdjudication,
  recoverInterruptedP63V2State,
  summarizeP63V2ExecutionState,
  type P63V2CalibrationState,
  type P63V2ManualAdjudicationRequest,
} from "./p6-3-v2-live-calibration-runner";
import {
  createP63V2FilePersistence,
  createP63V2ProviderExecutor,
  loadOrCreateP63V2State,
  runP63V2EndToEnd,
} from "./p6-3-v2-end-to-end";
import { loadP63V2FrozenRuntimeInputs } from "./p6-3-v2-frozen-input-resolver";
import {
  assertP63V2FinalPreLiveGatePassToken,
  type P63V2FinalPreLiveGatePassToken,
} from "./p6-3-v2-final-prelive-gate";
import {
  P6_3_V2_FROZEN_BUDGETS,
} from "./p6-3-v2-cli-preflight";
import {
  P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
} from "./p6-3-v2-execution-parameters";

export interface P63V2LiveEntrypointArgs {
  readonly preLiveToken: P63V2FinalPreLiveGatePassToken;
  readonly resumePath: string | null;
  readonly adjudicationsPath: string | null;
}

export interface P63V2LiveEntrypointResult {
  readonly statePath: string;
  readonly finalReportPath: string | null;
  readonly state: P63V2CalibrationState;
  readonly execution: ReturnType<typeof summarizeP63V2ExecutionState>;
}

/**
 * Provider-capable P6-3 v2 entrypoint. The CLI dynamically imports this module
 * only after explicit paid/live authorization and a fresh final pre-live gate
 * have both succeeded on the exact checkout.
 */
export async function runP63V2LiveEntrypoint(
  args: P63V2LiveEntrypointArgs
): Promise<P63V2LiveEntrypointResult> {
  assertP63V2FinalPreLiveGatePassToken(args.preLiveToken);
  const receipt = args.preLiveToken.receipt;
  if (receipt.liveAuthorized !== false || receipt.providerCallsMade !== false) {
    throw new Error("P6-3 v2 live entrypoint requires a non-self-authorizing final pre-live receipt");
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const frozenInputs = loadP63V2FrozenRuntimeInputs({ repoRoot });
  const plan = buildP63CalibrationPlan(P6_3_V2_FROZEN_BUDGETS);
  if (plan.length !== 864) {
    throw new Error(`P6-3 v2 live entrypoint requires the frozen 864-cell plan, got ${plan.length}`);
  }

  const executionPolicy = Object.freeze({
    maxScientificAttemptsPerLogicalCell:
      P6_3_V2_MAX_SCIENTIFIC_ATTEMPTS_PER_LOGICAL_CELL,
  });
  const frozenManifestHashes = receiptEvidenceHashes(receipt);
  const statePath = resolveStatePath(repoRoot, args.resumePath);
  const runDir = path.dirname(statePath);
  const persistence = createP63V2FilePersistence({ statePath });
  const loaded = loadOrCreateP63V2State({
    statePath,
    checkoutGitSha: receipt.checkoutGitSha,
    frozenManifestHashes,
    plan,
    executionPolicy,
  });
  const state = loaded.state;

  if (!loaded.resumed) {
    await persistence.persistState(state);
  } else if (state.inFlight) {
    recoverInterruptedP63V2State(state);
    await persistence.persistState(state);
  }

  if (args.adjudicationsPath) {
    const requests = loadAdjudications(args.adjudicationsPath);
    for (const request of requests) {
      applyP63V2ManualAdjudication(state, plan, request);
    }
    await persistence.persistState(state);
  }

  if (state.status !== "running") {
    return {
      statePath,
      finalReportPath: existingFinalReportPath(runDir),
      state,
      execution: summarizeP63V2ExecutionState(state),
    };
  }

  const rawExecutor = createP63V2ProviderExecutor({
    resolver: frozenInputs.resolver,
  });
  const result = await runP63V2EndToEnd({
    state,
    identity: {
      checkoutGitSha: receipt.checkoutGitSha,
      frozenManifestHashes,
      executionPolicy,
    },
    plan,
    rawExecutor,
    persistence,
  });

  return {
    statePath,
    finalReportPath: result.finalReportPath
      ? path.resolve(runDir, result.finalReportPath)
      : null,
    state: result.state,
    execution: result.execution,
  };
}

function resolveStatePath(repoRoot: string, resumePath: string | null): string {
  if (resumePath) {
    const resolved = path.resolve(resumePath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`P6-3 v2 --resume state file does not exist: ${resolved}`);
    }
    return resolved;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(repoRoot, "runs", `p6-3-v2-live-${stamp}`, "state.json");
}

function loadAdjudications(filePath: string): P63V2ManualAdjudicationRequest[] {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("P6-3 v2 --adjudications must contain a non-empty JSON array");
  }
  return parsed as P63V2ManualAdjudicationRequest[];
}

function existingFinalReportPath(runDir: string): string | null {
  const candidate = path.join(runDir, "final-report.json");
  return fs.existsSync(candidate) ? candidate : null;
}

function receiptEvidenceHashes(
  receipt: P63V2FinalPreLiveGatePassToken["receipt"]
): Readonly<Record<string, string>> {
  const evidence = [
    receipt.finalSpec,
    ...receipt.frozenEvidence,
    ...receipt.sourceEvidence,
    ...receipt.verifierEvidence,
    ...receipt.operationalEvidence,
  ];
  return Object.freeze(
    Object.fromEntries(evidence.map((item) => [item.path, item.sha256]))
  );
}
