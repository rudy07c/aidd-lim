import OpenAI from "openai";
import {
  AgentRetrievedDecision,
} from "../../context/agent-retrieved-episode";
import {
  ResearchStatelessExecutorFactoryArgs,
  ResearchStatelessModelInput,
  ResearchStatelessStepExecutor,
  ResearchStatelessStepResult,
  ResearchStatelessToolDefinition,
} from "../../context/research-stateless-episode";
import {
  OPENAI_MUTATION_OUTPUT_SPEC,
  OpenAIRequestOptions,
  buildOpenAIStructuredResponseRequestBody,
  extractRefusal,
  parseStructuredMutation,
  responseFailureDetails,
} from "./shared";
import type { AgentTool } from "../types";

export interface OpenAIResearchStatelessAROptions extends OpenAIRequestOptions {
  requestTimeoutMs: number;
  maxRetries: number;
}

/**
 * One fresh OpenAI Responses call for one AR reasoning step.
 *
 * It may either emit one function call or the final structured mutation. It never
 * executes the function call inside the provider conversation and never replays a
 * prior response/output item. The caller/controller executes the tool through the
 * budgeted retrieval gateway and starts a brand-new executor for the next step.
 */
export class OpenAIResearchStatelessARExecutor
  implements ResearchStatelessStepExecutor<AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }>>
{
  private readonly client: OpenAI;

  constructor(
    private readonly options: OpenAIResearchStatelessAROptions,
    private readonly protocolId: string,
    private readonly toolDefinitions: readonly ResearchStatelessToolDefinition[]
  ) {
    if (options.storeResponses) {
      throw new Error("Research-stateless AR requires storeResponses=false");
    }
    this.client = new OpenAI({
      timeout: options.requestTimeoutMs,
      maxRetries: options.maxRetries,
    });
  }

  async runFresh(
    input: Readonly<ResearchStatelessModelInput>
  ): Promise<ResearchStatelessStepResult<AgentRetrievedDecision<{ modifiedFiles: Record<string, string> }>>> {
    const body = buildOpenAIStructuredResponseRequestBody({
      options: this.options,
      responseInput: [{ role: "user", content: buildARUserMessage(input) }],
      tools: this.toolDefinitions.map(schemaOnlyAgentTool),
      includeEncryptedReasoning: false,
      outputSpec: OPENAI_MUTATION_OUTPUT_SPEC,
    });
    const response = await this.client.responses.create(body as any);
    const refusal = extractRefusal(response);
    if (refusal !== null) throw new Error(`AR model refusal: ${refusal}`);
    if (response.status !== "completed") {
      const details = responseFailureDetails(response);
      throw new Error(
        details.providerErrorMessage ??
          `AR response status=${response.status}${details.incompleteReason ? ` reason=${details.incompleteReason}` : ""}`
      );
    }

    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call"
    );
    if (calls.length > 1) {
      throw new Error(`AR research-stateless step emitted ${calls.length} function calls; expected at most one`);
    }

    if (calls.length === 1) {
      const call = calls[0];
      if (!this.toolDefinitions.some((tool) => tool.name === call.name)) {
        throw new Error(`AR model called unknown tool: ${call.name}`);
      }
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(call.arguments);
      } catch (error) {
        throw new Error(
          `AR tool arguments are not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      return {
        decision: {
          kind: "retrieve",
          call: {
            toolName: call.name as "list_files" | "search" | "read_chunk",
            arguments: argumentsValue,
          },
        },
        rawResponse: response.output_text ?? "",
        transport: statelessTransport(this.protocolId),
      };
    }

    const rawResponse = response.output_text ?? "";
    const parsed = parseStructuredMutation(rawResponse);
    if (!parsed.ok) throw new Error(`AR final mutation parse failed: ${parsed.error}`);
    return {
      decision: {
        kind: "finalize",
        value: { modifiedFiles: parsed.value.modifiedFiles },
      },
      rawResponse,
      explicitMemoryUpdate: parsed.value.workingNote,
      transport: statelessTransport(this.protocolId),
    };
  }
}

export function createOpenAIResearchStatelessARExecutorFactory(
  options: OpenAIResearchStatelessAROptions
) {
  return (args: Readonly<ResearchStatelessExecutorFactoryArgs>) => {
    if (args.condition !== "AR") {
      throw new Error(`OpenAI AR executor received non-AR condition: ${args.condition}`);
    }
    return new OpenAIResearchStatelessARExecutor(
      options,
      args.protocolId,
      args.toolDefinitions
    );
  };
}

export function buildARUserMessage(input: Readonly<ResearchStatelessModelInput>): string {
  const lines = [
    `CURRENT TASK:\n${input.visibleInstruction}`,
    "\nCURRENT WORKING SET:",
  ];
  if (input.artifactEvidence.length === 0) {
    lines.push("\n<empty>");
  } else {
    for (const evidence of input.artifactEvidence) lines.push(`\n${evidence}`);
  }
  lines.push(`\nEXPLICIT MEMORY:\n${input.explicitMemory ?? "<none>"}`);
  lines.push(
    "\nUse one retrieval function if more repository evidence is needed. Otherwise return the final structured repository mutation."
  );
  return lines.join("");
}

function schemaOnlyAgentTool(definition: ResearchStatelessToolDefinition): AgentTool {
  return {
    name: definition.name,
    description: definition.description,
    parameters: { ...definition.parameters },
    async execute() {
      throw new Error("Research-stateless AR provider adapter must never execute tools in-call");
    },
  };
}

function statelessTransport(protocolId: string) {
  return {
    protocolId,
    previousResponseIdUsed: false,
    providerConversationReused: false,
    priorAssistantHistoryReplayed: false,
    encryptedReasoningReplayed: false,
    compactionStateReplayed: false,
    otherOpaqueStateReplayed: false,
    responseStored: false,
  } as const;
}
