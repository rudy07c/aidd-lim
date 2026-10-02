import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import type { GeneratedProbe } from "../calibration/src/probe-generator";
import { loadProbeMaterial } from "./p6-af-baseline-live";
import {
  buildGenerationZeroFixedEnvironment,
} from "./src/context/generation-zero-fixed-environment";
import {
  buildP63RSemPromptP62Compatible,
  buildP63RSemSchemaP62Compatible,
  P6_3_RSEM_OUTPUT_INSTRUCTIONS,
  P6_3_RSEM_PROVIDER_CONTRACT,
  P6_3_RSEM_SCHEMA_VERSION,
} from "./src/p6/p6-3-rsem-protocol-parity";
import {
  buildOpenAIStructuredResponseRequestBody,
} from "./src/agent-backend/openai/shared";
import {
  buildP63V3RSemRequestBody,
} from "./src/p6/p6-3-v3-rsem-executor";
import {
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_VALID_TRIALS_PER_CANDIDATE,
  buildP63V3RSemReliabilityAuditPlan,
  projectedP63V3RSemReliabilityAttemptCostUsd,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-spec";
import {
  buildP63V3RSemReliabilityAuditRequestBody,
  executeP63V3RSemReliabilityAuditAttempt,
  type P63V3RSemReliabilityAuditExecutorOutcome,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-executor";
import {
  prepareP63V3RSemReliabilityAudit,
  type P63V3PreparedRSemReliabilityAudit,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-runner";
import {
  applyP63V3RSemReliabilityAuditAdjudication,
  authorizeP63V3RSemReliabilityAuditPaidInvocation,
  createP63V3RSemReliabilityAuditState,
  executeP63V3ControlledRSemReliabilityAudit,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV,
  summarizeP63V3RSemReliabilityAudit,
  type P63V3RSemReliabilityAuditPersistence,
} from "./src/p6/p6-3-v3-rsem-reliability-audit-controller";

const repoRoot = path.resolve(__dirname, "..");
const syntheticWorldDir = path.join(repoRoot, "synthetic-world");
const repositoryFiles = loadRepository(path.join(syntheticWorldDir, "repository"));
const probes = loadProbeMaterial(syntheticWorldDir).booleanProbes;
assert.equal(probes.length, 12);

const plan = buildP63V3RSemReliabilityAuditPlan();
assert.equal(plan.length, P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_VALID_TRIALS);
assert.deepEqual(
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.candidateCaps,
  [32000, 64000]
);
assert.equal(
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.hardAuditCap,
  64000
);
assert.equal(
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.providerTechnicalMaxOutputTokens,
  128000
);
assert.equal(
  P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.validTrialsPerCandidate,
  60
);
assert.equal(
  P6_3_V3_RSEM_RELIABILITY_AUDIT_MAX_PROVIDER_ATTEMPTS,
  360
);
for (const cap of [32000, 64000] as const) {
  const candidate = plan.filter((cell) => cell.candidateCap === cap);
  assert.equal(
    candidate.length,
    P6_3_V3_RSEM_RELIABILITY_AUDIT_VALID_TRIALS_PER_CANDIDATE
  );
  for (const arm of ["B0", "B1", "B2", "B3", "B4", "AF"] as const) {
    assert.equal(candidate.filter((cell) => cell.armLabel === arm).length, 10);
  }
}

const frozen = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "frozen",
      "p6-3-v3-rsem-reliability-audit.json"
    ),
    "utf8"
  )
);
assert.equal(frozen.specVersion, P6_3_V3_RSEM_RELIABILITY_AUDIT_CONTRACT.version);
assert.deepEqual(frozen.candidateCaps, [32000, 64000]);
assert.equal(frozen.hardAuditCap, 64000);
assert.equal(frozen.providerTechnicalMaxOutputTokens, 128000);
assert.equal(frozen.trialDesign.validTrialsPerCandidate, 60);
assert.equal(frozen.attemptPolicy.maximumProviderAttempts, 360);
assert.equal(
  frozen.operationalCost.accumulatedEstimatedCostCeilingUsd,
  P6_3_V3_RSEM_RELIABILITY_AUDIT_COST_CEILING_USD
);
assert(Math.abs(frozen.operationalCost.controlEnvelopeCostUsd - 21.276) < 1e-12);

const fixedEnvironment = buildGenerationZeroFixedEnvironment({
  repositoryFiles,
});
const request = buildP63V3RSemReliabilityAuditRequestBody({
  contextFiles: { "src/a.ts": "export const a = 1;\n" },
  probes,
  fixedEnvironment,
  maxOutputTokens: 32000,
}) as any;
assert.equal(request.model, P6_3_RSEM_PROVIDER_CONTRACT.model);
assert.equal(request.reasoning.effort, "high");
assert.equal(request.max_output_tokens, 32000);
assert.equal(request.store, false);
assert.equal(request.service_tier, "default");
assert.equal(request.prompt_cache_options.mode, "implicit");
assert.equal(request.text.format.strict, true);
assert.equal(Object.keys(request.text.format.schema.properties).length, 12);
assert(request.input[0].content.includes("FIXED ENVIRONMENT SPECIFICATION"));
assert(request.input[0].content.includes("REPOSITORY FILES:"));

const historicalAtAuditCap = buildOpenAIStructuredResponseRequestBody({
  options: {
    model: P6_3_RSEM_PROVIDER_CONTRACT.model,
    reasoningEffort: P6_3_RSEM_PROVIDER_CONTRACT.reasoningEffort,
    maxOutputTokens: 32000,
    storeResponses: P6_3_RSEM_PROVIDER_CONTRACT.storeResponses,
    serviceTier: P6_3_RSEM_PROVIDER_CONTRACT.serviceTier,
    promptCacheMode: P6_3_RSEM_PROVIDER_CONTRACT.promptCacheMode,
  },
  responseInput: [{
    role: "user",
    content: buildP63RSemPromptP62Compatible(
      { "src/a.ts": "export const a = 1;\n" },
      probes
    ),
  }],
  outputSpec: {
    instructions: P6_3_RSEM_OUTPUT_INSTRUCTIONS,
    schemaName: P6_3_RSEM_SCHEMA_VERSION.replace(/-/g, "_"),
    schema: buildP63RSemSchemaP62Compatible(probes),
  },
});
const expectedV3AtAuditCap = buildP63V3RSemRequestBody(
  historicalAtAuditCap,
  fixedEnvironment
);
assert.deepEqual(
  request,
  expectedV3AtAuditCap,
  "audit request must equal the frozen v3 Rsem request with max_output_tokens as the only provider-envelope change"
);

async function verifyExecutor(): Promise<void> {
  const completed = await executeP63V3RSemReliabilityAuditAttempt(
    {
      contextFiles: { "src/a.ts": "export const a = 1;\n" },
      probes,
      fixedEnvironment,
      maxOutputTokens: 32000,
    },
    () => ({
      responses: {
        create: async () => completedResponse(probes),
      },
    })
  );
  assert.equal(completed.decision.disposition, "valid-audit-trial");
  assert.equal(completed.decision.structureValid, true);
  assert.equal(completed.decision.configuredMaxOutputTokens, 32000);
  assert.equal((completed.decision as any).booleanCorrect, undefined);
  assert.equal((completed.decision as any).booleanAccuracy, undefined);
  assert.equal((completed.decision as any).semanticScore, undefined);

  const capped = await executeP63V3RSemReliabilityAuditAttempt(
    {
      contextFiles: { "src/a.ts": "export const a = 1;\n" },
      probes,
      fixedEnvironment,
      maxOutputTokens: 32000,
    },
    () => ({
      responses: {
        create: async () => incompleteResponse(32000, "max_output_tokens"),
      },
    })
  );
  assert.equal(capped.decision.disposition, "cap-censored");
  assert.equal(capped.decision.outputTokens, 32000);

  const timeoutLike = await executeP63V3RSemReliabilityAuditAttempt(
    {
      contextFiles: { "src/a.ts": "export const a = 1;\n" },
      probes,
      fixedEnvironment,
      maxOutputTokens: 32000,
    },
    () => ({
      responses: {
        create: async () => incompleteResponse(1200, "timeout"),
      },
    })
  );
  assert.equal(timeoutLike.decision.disposition, "non-cap-infrastructure");

  const malformed = await executeP63V3RSemReliabilityAuditAttempt(
    {
      contextFiles: { "src/a.ts": "export const a = 1;\n" },
      probes,
      fixedEnvironment,
      maxOutputTokens: 32000,
    },
    () => ({
      responses: {
        create: async () => ({
          ...completedResponse(probes),
          output_text: JSON.stringify({ unexpected: "true" }),
        }),
      },
    })
  );
  assert.equal(malformed.decision.disposition, "protocol-invalid");
  assert.equal(malformed.decision.structureValid, false);
}

async function preparedAudit(): Promise<P63V3PreparedRSemReliabilityAudit> {
  let fixedPersisted = 0;
  let auditPersisted = 0;
  const prepared = await prepareP63V3RSemReliabilityAudit({
    generationZeroRepositoryFiles: repositoryFiles,
    persistence: {
      persistRunFixedEnvironmentProvenance: () => { fixedPersisted += 1; },
      persistAuditProvenance: () => { auditPersisted += 1; },
    },
  });
  assert.equal(fixedPersisted, 1);
  assert.equal(auditPersisted, 1);
  assert.equal(prepared.plan.length, 120);
  return prepared;
}

async function verifyController(): Promise<void> {
  const prepared = await preparedAudit();
  const authorization = authorizeP63V3RSemReliabilityAuditPaidInvocation({
    live: true,
    paidAuthorization: true,
    environment: { [P6_3_V3_RSEM_RELIABILITY_AUDIT_PAID_ENV]: "1" },
    checkoutGitSha: "a".repeat(40),
    prepared,
  });

  {
    const state = createP63V3RSemReliabilityAuditState({
      prepared,
      authorization,
    });
    let calls = 0;
    await executeP63V3ControlledRSemReliabilityAudit({
      state,
      prepared,
      authorization,
      executor: {
        execute: async (cell, attempt) => {
          calls += 1;
          return fakeOutcome(cell.candidateCap, "valid-audit-trial");
        },
      },
      persistence: memoryPersistence(),
    });
    assert.equal(state.status, "completed");
    assert.equal(state.selectedMaxOutputTokens, 32000);
    assert.equal(calls, 60);
    assert.equal(state.attempts.length, 60);
    assert.equal(
      summarizeP63V3RSemReliabilityAudit(state).candidate32000.status,
      "qualified"
    );
  }

  {
    const state = createP63V3RSemReliabilityAuditState({
      prepared,
      authorization,
    });
    let calls = 0;
    await executeP63V3ControlledRSemReliabilityAudit({
      state,
      prepared,
      authorization,
      executor: {
        execute: async (cell) => {
          calls += 1;
          if (cell.candidateCap === 32000) {
            return fakeOutcome(32000, "cap-censored");
          }
          return fakeOutcome(64000, "valid-audit-trial");
        },
      },
      persistence: memoryPersistence(),
    });
    assert.equal(state.status, "completed");
    assert.equal(state.selectedMaxOutputTokens, 64000);
    assert.equal(calls, 61);
    assert.equal(
      summarizeP63V3RSemReliabilityAudit(state).candidate32000.status,
      "rejected"
    );
    assert.equal(
      summarizeP63V3RSemReliabilityAudit(state).candidate64000.status,
      "qualified"
    );
  }

  {
    const state = createP63V3RSemReliabilityAuditState({
      prepared,
      authorization,
    });
    let calls = 0;
    await executeP63V3ControlledRSemReliabilityAudit({
      state,
      prepared,
      authorization,
      executor: {
        execute: async (cell) => {
          calls += 1;
          return fakeOutcome(cell.candidateCap, "cap-censored");
        },
      },
      persistence: memoryPersistence(),
    });
    assert.equal(state.status, "needs-design-audit");
    assert.equal(state.selectedMaxOutputTokens, null);
    assert.equal(calls, 2);
    assert.equal(state.auditFlag?.kind, "hard-audit-cap-censored");
  }

  {
    const state = createP63V3RSemReliabilityAuditState({
      prepared,
      authorization,
    });
    let first = true;
    await executeP63V3ControlledRSemReliabilityAudit({
      state,
      prepared,
      authorization,
      executor: {
        execute: async (cell) => {
          if (first) {
            first = false;
            return fakeOutcome(cell.candidateCap, "non-cap-infrastructure");
          }
          return fakeOutcome(cell.candidateCap, "valid-audit-trial");
        },
      },
      persistence: memoryPersistence(),
    });
    assert.equal(state.status, "needs-audit");
    assert.equal(
      state.auditFlag?.kind,
      "non-cap-infrastructure-adjudication-required"
    );
    applyP63V3RSemReliabilityAuditAdjudication({
      state,
      prepared,
      authorization,
      reviewer: "offline-verifier",
      reason: "fixture non-cap event",
      action: "replace-non-cap-infrastructure",
      adjudicatedAt: "2026-10-03T00:00:00.000Z",
    });
    assert.equal(state.status, "running");
    assert.equal(state.nextAttempt, 2);
    assert(state.attempts[0].adjudication);
  }

  {
    const state = createP63V3RSemReliabilityAuditState({
      prepared,
      authorization,
    });
    state.accumulatedEstimatedCostUsd = 21.99;
    let calls = 0;
    await executeP63V3ControlledRSemReliabilityAudit({
      state,
      prepared,
      authorization,
      executor: {
        execute: async (cell) => {
          calls += 1;
          return fakeOutcome(cell.candidateCap, "valid-audit-trial");
        },
      },
      persistence: memoryPersistence(),
    });
    assert.equal(calls, 0);
    assert.equal(state.status, "needs-audit");
    assert.equal(state.auditFlag?.kind, "operational-cost-ceiling-reached");
  }

  assert(
    projectedP63V3RSemReliabilityAttemptCostUsd(64000) >
    projectedP63V3RSemReliabilityAttemptCostUsd(32000)
  );
}

function fakeOutcome(
  cap: 32000 | 64000,
  disposition:
    | "valid-audit-trial"
    | "cap-censored"
    | "non-cap-infrastructure"
): P63V3RSemReliabilityAuditExecutorOutcome {
  const outputTokens = disposition === "cap-censored" ? cap : 1000;
  const decision = {
    disposition,
    responseStatus:
      disposition === "cap-censored" ? "incomplete" : "completed",
    incompleteReason:
      disposition === "cap-censored" ? "max_output_tokens" : null,
    configuredMaxOutputTokens: cap,
    inputTokens: 1000,
    outputTokens,
    reasoningOutputTokens: Math.min(outputTokens, 900),
    totalTokens: 1000 + outputTokens,
    structureValid: disposition === "valid-audit-trial" ? true : null,
    estimatedCostUsd: 0,
    actualModel: "gpt-5.6-luna",
    responseId: "resp_fixture",
    providerErrorCode: null,
    failureReason:
      disposition === "cap-censored"
        ? "exact-cap-max_output_tokens"
        : disposition === "non-cap-infrastructure"
        ? "fixture-infrastructure"
        : null,
  } as const;
  return {
    decision,
    artifact: {
      executorVersion: "p6-3-v3-rsem-reliability-audit-executor-v1",
      v3PromptVersion: "p6-3-v3-rsem-fixed-environment-v1",
      v3OutputInstructionsSha256:
        "301aa3b5741c120cf1d749bbde76affa9fd73838097bb8fd4c27310abdbf4323",
      historicalOutputInstructionsSha256: "fixture",
      requestBodySha256: "fixture",
      fixedEnvironmentIdentity: "fixture",
      fixedEnvironment: {} as any,
      rawResponse: "",
      decision,
      sdkVersion: "fixture",
    },
  };
}

function memoryPersistence(): P63V3RSemReliabilityAuditPersistence {
  return {
    persistState: () => {},
    persistAttemptArtifact: (cell, attempt) =>
      `attempts/${cell.sequence}-${attempt}.json`,
  };
}

function completedResponse(probeBank: readonly GeneratedProbe[]) {
  return {
    id: "resp_reliability_offline",
    model: "gpt-5.6-luna",
    status: "completed",
    output_text: JSON.stringify(
      Object.fromEntries(probeBank.map((probe) => [probe.probeId, "true"]))
    ),
    output: [],
    usage: {
      input_tokens: 1500,
      output_tokens: 500,
      total_tokens: 2000,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 350 },
    },
  };
}

function incompleteResponse(
  outputTokens: number,
  reason: string
) {
  return {
    id: "resp_reliability_incomplete",
    model: "gpt-5.6-luna",
    status: "incomplete",
    incomplete_details: { reason },
    output_text: "",
    output: [],
    usage: {
      input_tokens: 1500,
      output_tokens: outputTokens,
      total_tokens: 1500 + outputTokens,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: outputTokens },
    },
  };
}

function loadRepository(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) {
        out[path.relative(dir, full).split(path.sep).join("/")] =
          fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(dir);
  return out;
}

function verifySemanticFirewall(): void {
  const executorSource = fs.readFileSync(
    path.join(
      __dirname,
      "src",
      "p6",
      "p6-3-v3-rsem-reliability-audit-executor.ts"
    ),
    "utf8"
  );
  const controllerSource = fs.readFileSync(
    path.join(
      __dirname,
      "src",
      "p6",
      "p6-3-v3-rsem-reliability-audit-controller.ts"
    ),
    "utf8"
  );
  assert(!executorSource.includes("GeneratedProbe"));
  assert(!executorSource.includes("scoreProbes"));
  assert(!executorSource.includes("correctAnswer"));
  assert(!executorSource.includes("booleanCorrect"));
  assert(!executorSource.includes("booleanAccuracy"));
  assert(!executorSource.includes("semanticScore"));
  assert(!controllerSource.includes("rawResponse"));
  assert(!controllerSource.includes("correctAnswer"));
  assert(!controllerSource.includes("booleanCorrect"));
  assert(!controllerSource.includes("booleanAccuracy"));
  assert(!controllerSource.includes("semanticScore"));
}

async function main(): Promise<void> {
  verifySemanticFirewall();
  await verifyExecutor();
  await verifyController();
  console.log(JSON.stringify({
    status: "ok",
    slice: "p6-3-v3-rsem-reliability-audit-core",
    verified: [
      "32k-64k-candidate-ladder",
      "six-arms-times-ten-valid-trials",
      "120-valid-vs-360-attempt-boundary",
      "machine-readable-freeze",
      "v3-request-shape-with-cap-only-provider-change",
      "exact-cap-censoring-classification",
      "non-cap-infrastructure-separation",
      "structural-output-validation-without-semantic-scoring",
      "32k-qualification",
      "32k-reject-to-64k-escalation",
      "64k-reject-to-needs-design-audit",
      "human-adjudicated-non-cap-replacement",
      "pre-call-operational-cost-stop",
      "semantic-firewall",
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
