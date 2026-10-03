import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../../../calibration/src/probe-generator";
import {
  buildP63V3RSemCompletionCellExposure,
  prepareP63V3RSemCompletionRun,
  type P63V3PreparedRSemCompletionRun,
  type P63V3RSemCompletionTreatmentProvenance,
} from "./p6-3-v3-rsem-completion-runner";
import {
  applyP63V3RSemCompletionAdjudication,
  assertP63V3RSemCompletionResumeCompatible,
  authorizeP63V3RSemCompletionInvocation,
  createP63V3RSemCompletionState,
  executeP63V3ControlledRSemCompletion,
  recoverInterruptedP63V3RSemCompletionState,
  summarizeP63V3RSemCompletionState,
  type P63V3RSemCompletionAdjudicationRequest,
  type P63V3RSemCompletionAuthorizationToken,
  type P63V3RSemCompletionExecutor,
  type P63V3RSemCompletionPersistence,
  type P63V3RSemCompletionState,
} from "./p6-3-v3-rsem-completion-controller";
import {
  P6_3_V3_RSEM_COMPLETION_PREDECLARATION,
} from "./p6-3-v3-rsem-completion-predeclaration";
import type {
  P63V3RunFixedEnvironmentProvenance,
} from "./p6-3-v3-run-start";
import {
  assertP63V3RSemCompletionFinalPreLiveGatePassToken,
  type P63V3RSemCompletionFinalPreLiveGatePassToken,
} from "./p6-3-v3-rsem-completion-final-prelive-gate";

export const P6_3_V3_RSEM_COMPLETION_ENTRYPOINT_VERSION =
  "p6-3-v3-rsem-completion-entrypoint-v1" as const;

const PRELIVE_RECEIPT_FILE =
  "p6-3-v3-rsem-completion-final-prelive-receipt.json";
const FIXED_ENVIRONMENT_PROVENANCE_FILE =
  "fixed-environment-run.json";
const TREATMENT_PROVENANCE_FILE =
  "rsem-completion-treatment-provenance.json";

interface RuntimeInputs {
  readonly repositoryFiles:
    Readonly<Record<string, string>>;
  readonly probes: readonly GeneratedProbe[];
  readonly probePrompts: readonly string[];
  readonly syntheticWorldDir: string;
}

export interface P63V3RSemCompletionEntrypointTestDependencies {
  readonly executor?: P63V3RSemCompletionExecutor;
  readonly newStatePath?: string;
}

export interface P63V3RSemCompletionEntrypointArgs {
  readonly finalPreLiveToken:
    P63V3RSemCompletionFinalPreLiveGatePassToken;
  readonly paidAuthorization: boolean;
  readonly environment?: NodeJS.ProcessEnv;
  readonly resumePath: string | null;
  readonly adjudicationsPath: string | null;
  readonly testDependencies?:
    P63V3RSemCompletionEntrypointTestDependencies;
}

export interface P63V3RSemCompletionEntrypointResult {
  readonly statePath: string;
  readonly state: P63V3RSemCompletionState;
  readonly execution: ReturnType<
    typeof summarizeP63V3RSemCompletionState
  >;
}

export async function runP63V3RSemCompletionEntrypoint(
  args: P63V3RSemCompletionEntrypointArgs
): Promise<P63V3RSemCompletionEntrypointResult> {
  assertP63V3RSemCompletionFinalPreLiveGatePassToken(
    args.finalPreLiveToken
  );
  const receipt =
    args.finalPreLiveToken.receipt;
  if (
    receipt.liveAuthorized !== false ||
    receipt.providerCallsMade !== false
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion entrypoint requires a non-self-authorizing final pre-live receipt"
    );
  }

  const environment =
    args.environment ?? process.env;
  if (
    !args.testDependencies?.executor &&
    !environment.OPENAI_API_KEY
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion entrypoint requires OPENAI_API_KEY when no offline executor injection is supplied; no provider calls were made."
    );
  }

  const repoRoot = path.resolve(
    __dirname,
    "../../.."
  );
  const runtimeInputs =
    loadRuntimeInputs(repoRoot);
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
    "completion final pre-live receipt"
  );

  const prepared =
    await prepareP63V3RSemCompletionRun({
      generationZeroRepositoryFiles:
        runtimeInputs.repositoryFiles,
      persistence:
        createPreparationPersistence(
          runDir,
          resume
        ),
    });

  const authorization =
    authorizeP63V3RSemCompletionInvocation({
      live: true,
      paidAuthorization:
        args.paidAuthorization,
      environment,
      checkoutGitSha:
        receipt.checkoutGitSha,
      prepared,
    });

  const controllerPersistence =
    createControllerPersistence(statePath);
  let state = loadOrCreateState({
    statePath,
    resume,
    prepared,
    authorization,
  });

  if (!resume) {
    await controllerPersistence.persistState(
      state
    );
  } else if (state.inFlight) {
    recoverInterruptedP63V3RSemCompletionState(
      state
    );
    await controllerPersistence.persistState(
      state
    );
  }

  if (args.adjudicationsPath) {
    const requests = loadAdjudications(
      args.adjudicationsPath
    );
    for (const request of requests) {
      applyP63V3RSemCompletionAdjudication({
        state,
        prepared,
        request,
      });
    }
    await controllerPersistence.persistState(
      state
    );
  }

  if (state.status !== "running") {
    return {
      statePath,
      state,
      execution:
        summarizeP63V3RSemCompletionState(
          state
        ),
    };
  }

  const executor =
    args.testDependencies?.executor ??
    createProductionExecutor({
      prepared,
      runtimeInputs,
    });
  state =
    await executeP63V3ControlledRSemCompletion({
      state,
      prepared,
      authorization,
      executor,
      persistence: controllerPersistence,
    });

  return {
    statePath,
    state,
    execution:
      summarizeP63V3RSemCompletionState(
        state
      ),
  };
}

function createProductionExecutor(args: {
  prepared:
    Readonly<P63V3PreparedRSemCompletionRun>;
  runtimeInputs: RuntimeInputs;
}): P63V3RSemCompletionExecutor {
  const { prepared, runtimeInputs } = args;
  const exposureCache = new Map<
    string,
    ReturnType<
      typeof buildP63V3RSemCompletionCellExposure
    >
  >();

  return {
    execute: async (cell) => {
      const key = cell.armLabel;
      let exposure =
        exposureCache.get(key);
      if (!exposure) {
        exposure =
          buildP63V3RSemCompletionCellExposure({
            cell,
            repositoryFiles:
              runtimeInputs.repositoryFiles,
            syntheticWorldDir:
              runtimeInputs.syntheticWorldDir,
            probePrompts:
              runtimeInputs.probePrompts,
          });
        exposureCache.set(key, exposure);
      }
      return prepared.runStart.executeRSemCell({
        contextFiles: exposure.contextFiles,
        probes: [...runtimeInputs.probes],
        repeat: cell.repeat,
        exposure: exposure.evidence,
      });
    },
  };
}

function loadRuntimeInputs(
  repoRoot: string
): RuntimeInputs {
  const syntheticWorldDir = path.join(
    repoRoot,
    "synthetic-world"
  );
  const repositoryFiles:
    Record<string, string> = {};
  loadRepository(
    path.join(
      syntheticWorldDir,
      "repository"
    ),
    path.join(
      syntheticWorldDir,
      "repository"
    ),
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
      "P6-3 v3 Rsem completion parity manifest is not frozen-pass"
    );
  }
  const probeIds =
    parity.probeBank?.booleanProbeIds as
      | string[]
      | undefined;
  if (
    !Array.isArray(probeIds) ||
    probeIds.length !==
      P6_3_V3_RSEM_COMPLETION_PREDECLARATION
        .freshRSem.booleanProbeCount
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion frozen probe ID bank mismatch"
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
    allProbes.map((probe) => [
      probe.probeId,
      probe,
    ])
  );
  const probes = probeIds.map((probeId) => {
    const probe = probeById.get(probeId);
    if (!probe) {
      throw new Error(
        `P6-3 v3 Rsem completion frozen probe missing: ${probeId}`
      );
    }
    if (
      probe.type !== "boolean" ||
      probe.namingScheme !==
        P6_3_V3_RSEM_COMPLETION_PREDECLARATION
          .freshRSem.namingSchemeId
    ) {
      throw new Error(
        `P6-3 v3 Rsem completion probe contract drift: ${probeId}`
      );
    }
    return probe;
  });

  return Object.freeze({
    repositoryFiles: Object.freeze({
      ...repositoryFiles,
    }),
    probes: Object.freeze(probes),
    probePrompts: Object.freeze(
      probes.map((probe) => probe.prompt)
    ),
    syntheticWorldDir,
  });
}

function createPreparationPersistence(
  runDir: string,
  resume: boolean
) {
  return {
    persistRunFixedEnvironmentProvenance: (
      value:
        Readonly<P63V3RunFixedEnvironmentProvenance>
    ) =>
      persistOrVerifyJson(
        path.join(
          runDir,
          FIXED_ENVIRONMENT_PROVENANCE_FILE
        ),
        value,
        resume,
        "run-fixed environment provenance"
      ),
    persistRSemCompletionTreatmentProvenance: (
      value:
        Readonly<P63V3RSemCompletionTreatmentProvenance>
    ) =>
      persistOrVerifyJson(
        path.join(
          runDir,
          TREATMENT_PROVENANCE_FILE
        ),
        value,
        resume,
        "Rsem completion treatment provenance"
      ),
  };
}

function createControllerPersistence(
  statePath: string
): P63V3RSemCompletionPersistence {
  const runDir = path.dirname(statePath);
  const attemptsDir = path.join(
    runDir,
    "attempts"
  );
  fs.mkdirSync(attemptsDir, {
    recursive: true,
  });

  return {
    persistState: (state) =>
      writeJsonAtomic(statePath, state),
    persistAttemptArtifact: (
      cell,
      attempt,
      payload
    ) => {
      const target = path.join(
        attemptsDir,
        `${String(
          cell.collectionSequence
        ).padStart(2, "0")}-canonical-${cell.canonicalV3Sequence}-${cell.armLabel}-attempt-${attempt}.json`
      );
      if (fs.existsSync(target)) {
        throw new Error(
          `P6-3 v3 Rsem completion attempt artifact already exists: ${target}`
        );
      }
      writeJsonAtomic(target, payload);
      return path
        .relative(runDir, target)
        .split(path.sep)
        .join("/");
    },
  };
}

function loadOrCreateState(args: {
  statePath: string;
  resume: boolean;
  prepared:
    Readonly<P63V3PreparedRSemCompletionRun>;
  authorization:
    P63V3RSemCompletionAuthorizationToken;
}): P63V3RSemCompletionState {
  if (!args.resume) {
    if (fs.existsSync(args.statePath)) {
      throw new Error(
        `P6-3 v3 Rsem completion new-run state already exists: ${args.statePath}`
      );
    }
    return createP63V3RSemCompletionState({
      prepared: args.prepared,
      authorization: args.authorization,
    });
  }

  if (
    !fs.existsSync(args.statePath) ||
    !fs.statSync(args.statePath).isFile()
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion --resume state file does not exist: ${args.statePath}`
    );
  }
  const state = JSON.parse(
    fs.readFileSync(
      args.statePath,
      "utf8"
    )
  ) as P63V3RSemCompletionState;
  assertP63V3RSemCompletionResumeCompatible({
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
  if (resumePath) {
    return path.resolve(resumePath);
  }
  if (newStatePath) {
    return path.resolve(newStatePath);
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  return path.join(
    repoRoot,
    "runs",
    `p6-3-v3-rsem-completion-${stamp}`,
    "state.json"
  );
}

function loadAdjudications(
  filePath: string
): P63V3RSemCompletionAdjudicationRequest[] {
  const resolved = path.resolve(filePath);
  const parsed = JSON.parse(
    fs.readFileSync(resolved, "utf8")
  ) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0
  ) {
    throw new Error(
      "P6-3 v3 Rsem completion --adjudications must contain a non-empty JSON array"
    );
  }
  return parsed as
    P63V3RSemCompletionAdjudicationRequest[];
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
        `P6-3 v3 Rsem completion new-run ${label} already exists: ${target}`
      );
    }
    writeJsonAtomic(target, expected);
    return;
  }

  if (
    !fs.existsSync(target) ||
    !fs.statSync(target).isFile()
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion resume ${label} missing: ${target}`
    );
  }
  const actual = JSON.parse(
    fs.readFileSync(target, "utf8")
  ) as unknown;
  if (
    stableJson(actual) !==
    stableJson(expected)
  ) {
    throw new Error(
      `P6-3 v3 Rsem completion resume ${label} mismatch: ${target}`
    );
  }
}

function writeJsonAtomic(
  target: string,
  value: unknown
): void {
  fs.mkdirSync(path.dirname(target), {
    recursive: true,
  });
  const temporary =
    `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(
    temporary,
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  );
  fs.renameSync(temporary, target);
}

function loadRepository(
  dir: string,
  baseDir: string,
  out: Record<string, string>
): void {
  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true,
  })) {
    const full = path.join(
      dir,
      entry.name
    );
    if (entry.isDirectory()) {
      loadRepository(full, baseDir, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts")
    ) {
      out[
        path
          .relative(baseDir, full)
          .split(path.sep)
          .join("/")
      ] = fs.readFileSync(full, "utf8");
    }
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>
      )
        .sort(([left], [right]) =>
          left.localeCompare(right)
        )
        .map(([key, item]) => [
          key,
          sortJson(item),
        ])
    );
  }
  return value;
}
