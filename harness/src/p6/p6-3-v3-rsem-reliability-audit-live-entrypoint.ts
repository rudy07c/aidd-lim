import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import {
  buildP63V3RSemReliabilityAuditExposure,
  prepareP63V3RSemReliabilityAudit,
  type P63V3PreparedRSemReliabilityAudit,
  type P63V3RSemReliabilityAuditProvenance,
} from "./p6-3-v3-rsem-reliability-audit-runner";
import {
  executeP63V3RSemReliabilityAuditAttempt,
  type P63V3RSemReliabilityAuditProbe,
} from "./p6-3-v3-rsem-reliability-audit-executor";
import {
  applyP63V3RSemReliabilityAuditAdjudication,
  assertP63V3RSemReliabilityAuditResumeCompatible,
  authorizeP63V3RSemReliabilityAuditPaidInvocation,
  createP63V3RSemReliabilityAuditState,
  executeP63V3ControlledRSemReliabilityAudit,
  recoverInterruptedP63V3RSemReliabilityAuditState,
  summarizeP63V3RSemReliabilityAudit,
  type P63V3RSemReliabilityAuditExecutor,
  type P63V3RSemReliabilityAuditPersistence,
  type P63V3RSemReliabilityAuditState,
} from "./p6-3-v3-rsem-reliability-audit-controller";
import {
  assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken,
  type P63V3RSemReliabilityAuditFinalPreLiveGatePassToken,
} from "./p6-3-v3-rsem-reliability-audit-final-prelive-gate";
import type {
  P63V3RunFixedEnvironmentProvenance,
} from "./p6-3-v3-run-start";

export const P6_3_V3_RSEM_RELIABILITY_AUDIT_LIVE_ENTRYPOINT_VERSION =
  "p6-3-v3-rsem-reliability-audit-live-entrypoint-v2" as const;

const PRELIVE_RECEIPT_FILE =
  "p6-3-v3-rsem-reliability-audit-final-prelive-receipt.json";
const FIXED_ENVIRONMENT_PROVENANCE_FILE = "fixed-environment-run.json";
const AUDIT_PROVENANCE_FILE = "audit-provenance.json";

interface RuntimeInputs {
  readonly repositoryFiles: Readonly<Record<string, string>>;
  readonly probes: readonly P63V3RSemReliabilityAuditProbe[];
  readonly syntheticWorldDir: string;
}

interface AdjudicationInput {
  readonly reviewer: string;
  readonly reason: string;
  readonly action: "replace-non-cap-infrastructure" | "abort-audit";
  readonly adjudicatedAt?: string;
}

export interface P63V3RSemReliabilityAuditLiveEntrypointTestDependencies {
  readonly executor?: P63V3RSemReliabilityAuditExecutor;
  readonly newStatePath?: string;
}

export interface P63V3RSemReliabilityAuditLiveEntrypointArgs {
  readonly finalPreLiveToken:
    P63V3RSemReliabilityAuditFinalPreLiveGatePassToken;
  readonly paidAuthorization: boolean;
  readonly environment?: NodeJS.ProcessEnv;
  readonly resumePath: string | null;
  readonly adjudicationPath: string | null;
  /** Provider-free verifier injection only. Production CLI never supplies this. */
  readonly testDependencies?:
    P63V3RSemReliabilityAuditLiveEntrypointTestDependencies;
}

export interface P63V3RSemReliabilityAuditLiveEntrypointResult {
  readonly statePath: string;
  readonly state: P63V3RSemReliabilityAuditState;
  readonly execution: ReturnType<typeof summarizeP63V3RSemReliabilityAudit>;
}

export async function runP63V3RSemReliabilityAuditLiveEntrypoint(
  args: P63V3RSemReliabilityAuditLiveEntrypointArgs
): Promise<P63V3RSemReliabilityAuditLiveEntrypointResult> {
  assertP63V3RSemReliabilityAuditFinalPreLiveGatePassToken(
    args.finalPreLiveToken
  );
  const receipt = args.finalPreLiveToken.receipt;
  if (receipt.liveAuthorized !== false || receipt.providerCallsMade !== false) {
    throw new Error(
      "Rsem reliability audit live entrypoint requires a non-self-authorizing final pre-live receipt"
    );
  }

  const environment = args.environment ?? process.env;
  if (!args.testDependencies?.executor && !environment.OPENAI_API_KEY) {
    throw new Error(
      "Rsem reliability audit live entrypoint requires OPENAI_API_KEY when no offline executor injection is supplied; no provider calls were made."
    );
  }

  const repoRoot = path.resolve(__dirname, "../../..");
  const runtimeInputs = loadRuntimeInputs(repoRoot);
  const statePath = resolveStatePath(
    repoRoot,
    args.resumePath,
    args.testDependencies?.newStatePath
  );
  const runDir = path.dirname(statePath);
  const resume = args.resumePath !== null;
  fs.mkdirSync(runDir, { recursive: true });

  persistOrVerifyJson(
    path.join(runDir, PRELIVE_RECEIPT_FILE),
    receipt,
    resume,
    "final pre-live receipt"
  );

  const prepared = await prepareP63V3RSemReliabilityAudit({
    generationZeroRepositoryFiles: runtimeInputs.repositoryFiles,
    persistence: createPreparationPersistence(runDir, resume),
  });
  if (prepared.plan.length !== 120) {
    throw new Error(
      `Rsem reliability audit live entrypoint requires 120 planned trials, got ${prepared.plan.length}`
    );
  }

  const authorization =
    authorizeP63V3RSemReliabilityAuditPaidInvocation({
      live: true,
      paidAuthorization: args.paidAuthorization,
      environment,
      checkoutGitSha: receipt.checkoutGitSha,
      prepared,
    });

  const controllerPersistence = createControllerPersistence(statePath);
  let state = loadOrCreateState({
    statePath,
    resume,
    prepared,
    authorization,
  });

  if (!resume) {
    await controllerPersistence.persistState(state);
  } else if (state.inFlight) {
    recoverInterruptedP63V3RSemReliabilityAuditState({
      state,
      prepared,
    });
    await controllerPersistence.persistState(state);
  }

  if (args.adjudicationPath) {
    const request = loadAdjudication(args.adjudicationPath);
    applyP63V3RSemReliabilityAuditAdjudication({
      state,
      prepared,
      authorization,
      reviewer: request.reviewer,
      reason: request.reason,
      action: request.action,
      adjudicatedAt: request.adjudicatedAt,
    });
    await controllerPersistence.persistState(state);
  }

  if (state.status !== "running") {
    return {
      statePath,
      state,
      execution: summarizeP63V3RSemReliabilityAudit(state),
    };
  }

  const executor =
    args.testDependencies?.executor ??
    createProductionExecutor({ prepared, runtimeInputs });
  state = await executeP63V3ControlledRSemReliabilityAudit({
    state,
    prepared,
    authorization,
    executor,
    persistence: controllerPersistence,
  });

  return {
    statePath,
    state,
    execution: summarizeP63V3RSemReliabilityAudit(state),
  };
}

function createProductionExecutor(args: {
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
  runtimeInputs: RuntimeInputs;
}): P63V3RSemReliabilityAuditExecutor {
  const { prepared, runtimeInputs } = args;
  const exposureCache = new Map<
    string,
    ReturnType<typeof buildP63V3RSemReliabilityAuditExposure>
  >();

  return {
    execute: async (cell) => {
      let exposure = exposureCache.get(cell.armLabel);
      if (!exposure) {
        exposure = buildP63V3RSemReliabilityAuditExposure({
          cell,
          repositoryFiles: runtimeInputs.repositoryFiles,
          syntheticWorldDir: runtimeInputs.syntheticWorldDir,
          probes: runtimeInputs.probes,
        });
        exposureCache.set(cell.armLabel, exposure);
      }
      return executeP63V3RSemReliabilityAuditAttempt({
        contextFiles: exposure.contextFiles,
        probes: runtimeInputs.probes,
        fixedEnvironment: prepared.fixedEnvironment,
        maxOutputTokens: cell.candidateCap,
      });
    },
  };
}

function loadRuntimeInputs(repoRoot: string): RuntimeInputs {
  const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
  const repositoryFiles: Record<string, string> = {};
  loadRepository(
    path.join(syntheticWorldDir, "repository"),
    path.join(syntheticWorldDir, "repository"),
    repositoryFiles
  );

  const parity = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        "harness",
        "frozen",
        "p6-3-rsem-protocol-parity.json"
      ),
      "utf8"
    )
  ) as any;
  if (parity.status !== "frozen-pass") {
    throw new Error(
      "Rsem reliability audit parity manifest is not frozen-pass"
    );
  }
  const probeIds = parity.probeBank?.booleanProbeIds as string[] | undefined;
  if (!Array.isArray(probeIds) || probeIds.length !== 12) {
    throw new Error(
      "Rsem reliability audit frozen boolean probe bank mismatch"
    );
  }

  const allProbes = JSON.parse(
    fs.readFileSync(
      path.join(
        repoRoot,
        "calibration",
        "fixtures",
        "probe-bank-stage1.json"
      ),
      "utf8"
    )
  ) as GeneratedProbe[];
  const probeById = new Map(
    allProbes.map((probe) => [probe.probeId, probe])
  );
  const probes = probeIds.map((probeId) => {
    const probe = probeById.get(probeId);
    if (!probe) {
      throw new Error(
        `Rsem reliability audit frozen probe missing: ${probeId}`
      );
    }
    if (probe.type !== "boolean" || probe.namingScheme !== "A-obfuscated") {
      throw new Error(
        `Rsem reliability audit probe contract drift: ${probeId}`
      );
    }
    return Object.freeze({
      probeId: probe.probeId,
      prompt: probe.prompt,
    });
  });

  return Object.freeze({
    repositoryFiles: Object.freeze({ ...repositoryFiles }),
    probes: Object.freeze(probes),
    syntheticWorldDir,
  });
}

function createPreparationPersistence(
  runDir: string,
  resume: boolean
) {
  return {
    persistRunFixedEnvironmentProvenance: (
      value: Readonly<P63V3RunFixedEnvironmentProvenance>
    ) =>
      persistOrVerifyJson(
        path.join(runDir, FIXED_ENVIRONMENT_PROVENANCE_FILE),
        value,
        resume,
        "run-fixed environment provenance"
      ),
    persistAuditProvenance: (
      value: Readonly<P63V3RSemReliabilityAuditProvenance>
    ) =>
      persistOrVerifyJson(
        path.join(runDir, AUDIT_PROVENANCE_FILE),
        value,
        resume,
        "audit provenance"
      ),
  };
}

function createControllerPersistence(
  statePath: string
): P63V3RSemReliabilityAuditPersistence {
  const runDir = path.dirname(statePath);
  const attemptsDir = path.join(runDir, "attempts");
  fs.mkdirSync(attemptsDir, { recursive: true });

  return {
    persistState: (state) => writeJsonAtomic(statePath, state),
    persistAttemptArtifact: (cell, attempt, payload) => {
      const target = path.join(
        attemptsDir,
        `${String(cell.sequence).padStart(4, "0")}-cap-${cell.candidateCap}-${cell.armLabel}-trial-${cell.trial}-attempt-${attempt}.json`
      );
      if (fs.existsSync(target)) {
        throw new Error(
          `Rsem reliability audit attempt artifact already exists: ${target}`
        );
      }
      writeJsonAtomic(target, payload);
      return path.relative(runDir, target).split(path.sep).join("/");
    },
  };
}

function loadOrCreateState(args: {
  statePath: string;
  resume: boolean;
  prepared: Readonly<P63V3PreparedRSemReliabilityAudit>;
  authorization: ReturnType<
    typeof authorizeP63V3RSemReliabilityAuditPaidInvocation
  >;
}): P63V3RSemReliabilityAuditState {
  if (!args.resume) {
    if (fs.existsSync(args.statePath)) {
      throw new Error(
        `Rsem reliability audit new-run state already exists: ${args.statePath}`
      );
    }
    return createP63V3RSemReliabilityAuditState({
      prepared: args.prepared,
      authorization: args.authorization,
    });
  }

  if (
    !fs.existsSync(args.statePath) ||
    !fs.statSync(args.statePath).isFile()
  ) {
    throw new Error(
      `Rsem reliability audit --resume state file does not exist: ${args.statePath}`
    );
  }
  const state = JSON.parse(
    fs.readFileSync(args.statePath, "utf8")
  ) as P63V3RSemReliabilityAuditState;
  assertP63V3RSemReliabilityAuditResumeCompatible({
    state,
    prepared: args.prepared,
    authorization: args.authorization,
  });
  return state;
}

function resolveStatePath(
  repoRoot: string,
  resumePath: string | null,
  newStatePath?: string
): string {
  if (resumePath) return path.resolve(resumePath);
  if (newStatePath) return path.resolve(newStatePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    repoRoot,
    "runs",
    `p6-3-v3-rsem-reliability-audit-${stamp}`,
    "state.json"
  );
}

function loadAdjudication(filePath: string): AdjudicationInput {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(
    fs.readFileSync(resolved, "utf8")
  ) as Partial<AdjudicationInput>;
  if (
    !parsed ||
    typeof parsed.reviewer !== "string" ||
    typeof parsed.reason !== "string" ||
    (parsed.action !== "replace-non-cap-infrastructure" &&
      parsed.action !== "abort-audit") ||
    (parsed.adjudicatedAt !== undefined &&
      typeof parsed.adjudicatedAt !== "string")
  ) {
    throw new Error(
      "Rsem reliability audit --adjudication must be a JSON object with reviewer, reason, action, and optional adjudicatedAt"
    );
  }
  return parsed as AdjudicationInput;
}

function persistOrVerifyJson(
  target: string,
  expected: unknown,
  resume: boolean,
  label: string
): void {
  if (!resume) {
    if (fs.existsSync(target)) {
      throw new Error(
        `Rsem reliability audit new-run ${label} already exists: ${target}`
      );
    }
    writeJsonAtomic(target, expected);
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(
      `Rsem reliability audit resume ${label} missing: ${target}`
    );
  }
  const actual = JSON.parse(
    fs.readFileSync(target, "utf8")
  ) as unknown;
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `Rsem reliability audit resume ${label} mismatch: ${target}`
    );
  }
}

function writeJsonAtomic(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
  fs.renameSync(temporary, target);
}

function loadRepository(
  dir: string,
  baseDir: string,
  out: Record<string, string>
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) loadRepository(full, baseDir, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out[path.relative(baseDir, full).split(path.sep).join("/")] =
        fs.readFileSync(full, "utf8");
    }
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}
