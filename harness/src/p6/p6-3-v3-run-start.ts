import {
  buildGenerationZeroFixedEnvironment,
  GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
  GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
} from "../context/generation-zero-fixed-environment";
import {
  assertFixedEnvironmentBinding,
  fixedEnvironmentIdentity,
  fixedEnvironmentLogSnapshot,
  type FixedEnvironmentBinding,
  type FixedEnvironmentLogSnapshot,
} from "../context/fixed-environment-runtime";
import type { P63CellOutcome } from "./p6-3-live-calibration-runner";
import { executeP63V3MCell } from "./p6-3-v3-m-executor";
import { executeP63V3RSemCell } from "./p6-3-v3-rsem-executor";

export const P6_3_V3_RUN_START_WIRING_VERSION =
  "p6-3-v3-run-start-wiring-v1" as const;
export const P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA =
  "p6-3-v3-run-fixed-environment-provenance-v1" as const;

type P63V3MCellArgs = Parameters<typeof executeP63V3MCell>[0];
type P63V3RSemCellArgs = Parameters<typeof executeP63V3RSemCell>[0];

export type P63V3RunMCellArgs = Omit<P63V3MCellArgs, "fixedEnvironment">;
export type P63V3RunRSemCellArgs = Omit<P63V3RSemCellArgs, "fixedEnvironment">;

export interface P63V3RunFixedEnvironmentProvenance {
  readonly schemaVersion: typeof P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA;
  readonly wiringVersion: typeof P6_3_V3_RUN_START_WIRING_VERSION;
  readonly builderVersion: typeof GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION;
  readonly repositorySerializerVersion: typeof GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION;
  readonly fixedEnvironmentIdentity: string;
  readonly fixedEnvironment: Readonly<FixedEnvironmentLogSnapshot>;
}

export interface P63V3RunStartPersistence {
  persistRunFixedEnvironmentProvenance(
    provenance: Readonly<P63V3RunFixedEnvironmentProvenance>
  ): void | Promise<void>;
}

type MExecutor = (args: P63V3MCellArgs) => Promise<P63CellOutcome>;
type RSemExecutor = (args: P63V3RSemCellArgs) => Promise<P63CellOutcome>;
type Builder = typeof buildGenerationZeroFixedEnvironment;

export interface P63V3RunStartDependencies {
  readonly buildFixedEnvironment?: Builder;
  readonly executeMCell?: MExecutor;
  readonly executeRSemCell?: RSemExecutor;
}

export interface P63V3RunStartContext {
  readonly fixedEnvironment: Readonly<FixedEnvironmentBinding>;
  readonly provenance: Readonly<P63V3RunFixedEnvironmentProvenance>;
  executeMCell(args: P63V3RunMCellArgs): Promise<P63CellOutcome>;
  executeRSemCell(args: P63V3RunRSemCellArgs): Promise<P63CellOutcome>;
}

/**
 * Initialize one P6-3 v3 run-fixed environment boundary.
 *
 * The Generation-0 builder is called exactly once inside this initializer.
 * The resulting frozen binding is captured by both executor closures and is
 * never rebuilt per measurement, arm, repeat, or cell. Run-level provenance is
 * persisted before the initialized context is returned to any caller.
 */
export async function initializeP63V3RunStart(args: {
  generationZeroRepositoryFiles: Readonly<Record<string, string>>;
  persistence: P63V3RunStartPersistence;
  dependencies?: P63V3RunStartDependencies;
}): Promise<Readonly<P63V3RunStartContext>> {
  const buildFixedEnvironment =
    args.dependencies?.buildFixedEnvironment ?? buildGenerationZeroFixedEnvironment;
  const mExecutor = args.dependencies?.executeMCell ?? executeP63V3MCell;
  const rsemExecutor = args.dependencies?.executeRSemCell ?? executeP63V3RSemCell;

  const fixedEnvironment = buildFixedEnvironment({
    repositoryFiles: args.generationZeroRepositoryFiles,
  });
  assertFixedEnvironmentBinding(fixedEnvironment);

  const identity = fixedEnvironmentIdentity(fixedEnvironment);
  const provenance: Readonly<P63V3RunFixedEnvironmentProvenance> = Object.freeze({
    schemaVersion: P6_3_V3_RUN_FIXED_ENVIRONMENT_PROVENANCE_SCHEMA,
    wiringVersion: P6_3_V3_RUN_START_WIRING_VERSION,
    builderVersion: GENERATION_ZERO_FIXED_ENVIRONMENT_BUILDER_VERSION,
    repositorySerializerVersion: GENERATION_ZERO_REPOSITORY_SERIALIZER_VERSION,
    fixedEnvironmentIdentity: identity,
    fixedEnvironment: fixedEnvironmentLogSnapshot(fixedEnvironment),
  });

  await args.persistence.persistRunFixedEnvironmentProvenance(provenance);

  const executeAndVerify = async (
    executor: (input: any) => Promise<P63CellOutcome>,
    cellArgs: Record<string, unknown>
  ): Promise<P63CellOutcome> => {
    const outcome = await executor({
      ...cellArgs,
      fixedEnvironment,
    });
    assertP63V3OutcomeUsesRunFixedEnvironment(outcome, provenance);
    return outcome;
  };

  return Object.freeze({
    fixedEnvironment,
    provenance,
    executeMCell: (cellArgs: P63V3RunMCellArgs) =>
      executeAndVerify(mExecutor as (input: any) => Promise<P63CellOutcome>, cellArgs),
    executeRSemCell: (cellArgs: P63V3RunRSemCellArgs) =>
      executeAndVerify(rsemExecutor as (input: any) => Promise<P63CellOutcome>, cellArgs),
  });
}

/** Fail closed if a v3 cell reports any E_fixed identity/snapshot other than the run-start one. */
export function assertP63V3OutcomeUsesRunFixedEnvironment(
  outcome: Readonly<P63CellOutcome>,
  provenance: Readonly<P63V3RunFixedEnvironmentProvenance>
): void {
  const diagnosticIdentity = outcome.diagnosticSummary.fixedEnvironmentIdentity;
  if (diagnosticIdentity !== provenance.fixedEnvironmentIdentity) {
    throw new Error(
      `P6-3 v3 fixed-environment diagnostic identity drift: ${String(diagnosticIdentity)} != ${provenance.fixedEnvironmentIdentity}`
    );
  }

  const artifact = outcome.artifactPayload;
  if (!artifact || typeof artifact !== "object") {
    throw new Error("P6-3 v3 outcome is missing artifact payload for fixed-environment provenance");
  }
  const logged = (artifact as { fixedEnvironment?: unknown }).fixedEnvironment;
  if (!logged || typeof logged !== "object") {
    throw new Error("P6-3 v3 outcome is missing fixed-environment artifact snapshot");
  }
  if (stableJson(logged) !== stableJson(provenance.fixedEnvironment)) {
    throw new Error("P6-3 v3 fixed-environment artifact snapshot drifted from run-start provenance");
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
