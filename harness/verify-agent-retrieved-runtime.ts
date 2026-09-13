import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { ExplorationBudget, ExplorationLimits } from "./src/context/exploration-budget";
import {
  AgentRetrievedDecision,
  AgentRetrievedEpisode,
} from "./src/context/agent-retrieved-episode";
import {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessModelInput,
  ResearchStatelessTransportAttestation,
} from "./src/context/research-stateless-episode";
import { WorkingSetManager } from "./src/context/working-set-manager";
import { createBudgetedRepositoryGateway } from "./src/repository/retrieval-gateway";

const PROTOCOL_ID = "stage1-ar-retrieval-v1";

const REPOSITORY: Record<string, string> = {
  "src/a.ts": [
    "export const alpha = 1;\n",
    ...Array.from({ length: 12 }, (_, i) => `export const a${i} = '${"x".repeat(32)}';\n`),
  ].join(""),
  "src/b.ts": [
    "export const beta = 2;\n",
    ...Array.from({ length: 12 }, (_, i) => `export const b${i} = '${"y".repeat(32)}';\n`),
  ].join(""),
  "README.md": "Synthetic visible repository.\n",
};

function limits(overrides: Partial<ExplorationLimits> = {}): ExplorationLimits {
  return {
    maxRetrievalOperations: 10,
    maxCumulativeRetrievedTokens: 10_000,
    maxModelCalls: 10,
    maxDecisionRounds: 10,
    ...overrides,
  };
}

function transport(): ResearchStatelessTransportAttestation {
  return {
    protocolId: PROTOCOL_ID,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  };
}

async function verifyIntegratedARLoop(): Promise<Record<string, unknown>> {
  const workingSet = new WorkingSetManager(180);
  const exploration = new ExplorationBudget(limits());
  const gateway = createBudgetedRepositoryGateway({
    repositoryFiles: REPOSITORY,
    explorationBudget: exploration,
    workingSet,
  });

  const seenInputs: ResearchStatelessModelInput[] = [];
  const toolSchemaNames: string[][] = [];
  let strictSchemasVerified = false;
  let step = 0;

  const episode = new AgentRetrievedEpisode<{ modifiedFiles: Record<string, string> }>({
    taskId: "T-ar-integration",
    visibleInstruction: "Inspect the repository and then make a no-op final decision.",
    protocolId: PROTOCOL_ID,
    workingSet,
    explorationBudget: exploration,
    gateway,
    executorFactory: (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
      assert.strictEqual(args.condition, "AR");
      toolSchemaNames.push(args.toolDefinitions.map((tool) => tool.name));
      for (const tool of args.toolDefinitions) {
        const schema = tool.parameters as {
          properties?: Record<string, unknown>;
          required?: string[];
          additionalProperties?: boolean;
        };
        assert.strictEqual(schema.additionalProperties, false);
        assert.deepStrictEqual(
          [...(schema.required ?? [])].sort(),
          Object.keys(schema.properties ?? {}).sort(),
          `${tool.name} strict schema must require every declared property`
        );
      }
      strictSchemasVerified = true;
      const invocation = step++;
      return {
        async runFresh(input) {
          seenInputs.push({
            visibleInstruction: input.visibleInstruction,
            artifactEvidence: [...input.artifactEvidence],
            explicitMemory: input.explicitMemory,
          });
          const decision: AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }> =
            invocation === 0
              ? {
                  kind: "retrieve",
                  call: { toolName: "list_files", arguments: { directory: null } },
                }
              : invocation === 1
                ? {
                    kind: "retrieve",
                    call: {
                      toolName: "read_chunk",
                      arguments: { path: "src/a.ts", startLine: 1, endLine: 8 },
                    },
                  }
                : invocation === 2
                  ? {
                      kind: "retrieve",
                      call: {
                        toolName: "read_chunk",
                        arguments: { path: "src/b.ts", startLine: 1, endLine: 8 },
                      },
                    }
                  : { kind: "finalize", value: { modifiedFiles: {} } };
          return {
            decision,
            rawResponse: `scripted-step-${invocation}`,
            transport: transport(),
          };
        },
      };
    },
  });

  const result = await episode.run();
  assert.deepStrictEqual(result.final, { modifiedFiles: {} });
  assert.strictEqual(result.retrievals.length, 3);
  for (const record of result.retrievals) {
    assert.deepStrictEqual(
      record.phaseTrace,
      ["begin", "access", "complete", "admit"],
      "every successful AR retrieval must follow begin->access->complete->admit"
    );
  }
  assert.ok(seenInputs[0].artifactEvidence.length === 0);
  assert.ok(seenInputs[1].artifactEvidence.length > 0, "list_files evidence must reach next fresh step via W_t");
  assert.ok(seenInputs[2].artifactEvidence.some((evidence) => evidence.includes("src/a.ts")));
  assert.ok(seenInputs[3].artifactEvidence.some((evidence) => evidence.includes("src/b.ts")));
  assert.ok(
    toolSchemaNames.every(
      (names) => names.join(",") === "list_files,search,read_chunk"
    ),
    "all fresh executors must receive the same fixed AR tool schemas"
  );
  assert.ok(strictSchemasVerified);

  const working = workingSet.snapshot();
  const used = exploration.snapshot().used;
  assert.ok(working.currentTokenUsage <= working.budgetTokens);
  assert.strictEqual(used.retrievalOperations, 3);
  assert.strictEqual(used.modelCalls, 4);
  assert.strictEqual(used.decisionRounds, 4);
  assert.ok(
    used.cumulativeRetrievedTokens > working.budgetTokens,
    "Accessor path must preserve cumulative>B_work while active<=B_work semantics"
  );
  assert.ok(working.evictionHistory.length > 0, "retrieved evidence should trigger FIFO under small B_work");
  assert.strictEqual(exploration.snapshot().pendingRetrieval, null);

  return {
    retrievalOperations: used.retrievalOperations,
    cumulativeRetrievedTokens: used.cumulativeRetrievedTokens,
    activeWorkingSetTokens: working.currentTokenUsage,
    bWork: working.budgetTokens,
    evictionCount: working.evictionHistory.length,
    phaseTraces: result.retrievals.map((record) => record.phaseTrace),
    freshModelCalls: used.modelCalls,
    strictSchemasVerified,
  };
}

async function verifyFailedAccessConsumesOperationAndClosesPending(): Promise<Record<string, unknown>> {
  const workingSet = new WorkingSetManager(200);
  const exploration = new ExplorationBudget(limits());
  const gateway = createBudgetedRepositoryGateway({
    repositoryFiles: REPOSITORY,
    explorationBudget: exploration,
    workingSet,
  });

  await assert.rejects(
    () => gateway.readChunk({ path: "../ground_truth.json" }),
    /escapes root/
  );
  const snapshot = exploration.snapshot();
  assert.strictEqual(snapshot.used.retrievalOperations, 1);
  assert.strictEqual(snapshot.used.cumulativeRetrievedTokens, 0);
  assert.strictEqual(snapshot.pendingRetrieval, null);
  assert.deepStrictEqual(gateway.records()[0].phaseTrace, ["begin", "complete"]);
  assert.strictEqual(workingSet.snapshot().currentTokenUsage, 0);

  return {
    failedOperationStillCharged: snapshot.used.retrievalOperations,
    exposedTokens: snapshot.used.cumulativeRetrievedTokens,
    pendingClosed: snapshot.pendingRetrieval === null,
  };
}

function verifyNoScientificRuntimeBypassesGateway(): Record<string, unknown> {
  const srcDir = path.join(__dirname, "src");
  const allowed = new Set([
    path.normalize(path.join(srcDir, "repository", "repository-accessor.ts")),
    path.normalize(path.join(srcDir, "repository", "retrieval-gateway.ts")),
  ]);
  const violations: string[] = [];

  walkTs(srcDir, (filePath, content) => {
    if (allowed.has(path.normalize(filePath))) return;
    if (content.includes("repository-accessor")) {
      violations.push(path.relative(srcDir, filePath));
    }
  });

  assert.deepStrictEqual(
    violations,
    [],
    `scientific runtime references raw RepositoryAccessor outside gateway: ${violations.join(", ")}`
  );
  return {
    rawAccessorAllowedFiles: [...allowed].map((file) => path.relative(srcDir, file)).sort(),
    bypassReferences: violations,
  };
}

function walkTs(dir: string, visit: (filePath: string, content: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, visit);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      visit(full, fs.readFileSync(full, "utf8"));
    }
  }
}

async function main(): Promise<void> {
  const integratedLoop = await verifyIntegratedARLoop();
  const failedAccess = await verifyFailedAccessConsumesOperationAndClosesPending();
  const bypassGuard = verifyNoScientificRuntimeBypassesGateway();

  console.log(
    JSON.stringify(
      {
        status: "ok",
        p5Slice: "ar-budgeted-retrieval-integration",
        sequence: ["E_max.beginRetrieval", "RepositoryAccessor", "E_max.completeRetrieval", "B_work.admit"],
        integratedLoop,
        failedAccess,
        bypassGuard,
        verified: [
          "AR-fixed-strict-function-tool-schemas-visible-to-every-fresh-executor",
          "AR-tool-call-dispatched-only-through-budgeted-gateway",
          "begin-access-complete-admit-order",
          "failed-access-consumes-retrieval-operation-with-zero-evidence",
          "raw-accessor-not-referenced-by-scientific-src-outside-accessor-and-gateway",
          "active-working-set-never-exceeds-B_work",
          "cumulative-retrieval-can-exceed-B_work",
          "FIFO-eviction-still-applies-through-accessor-path",
          "pending-retrieval-closed-before-next-fresh-inference",
        ],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
