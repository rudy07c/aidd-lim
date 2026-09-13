import type { ResearchStatelessToolDefinition } from "../context/research-stateless-episode";
import type { BudgetedRepositoryGateway, BudgetedRetrievalResult } from "./retrieval-gateway";

export type AgentRetrievalToolName = "list_files" | "search" | "read_chunk";

export interface AgentRetrievalToolCall {
  toolName: AgentRetrievalToolName;
  arguments: unknown;
}

export interface AgentRetrievalTool {
  definition: ResearchStatelessToolDefinition;
  execute(argumentsValue: unknown): Promise<BudgetedRetrievalResult>;
}

/**
 * AR-only function tool surface. These tools never own repository access directly;
 * every execution delegates to BudgetedRepositoryGateway so E_max/B_work cannot be bypassed.
 *
 * Schemas follow strict function-calling discipline: every declared property is in
 * `required`; semantically optional values are represented as nullable. This keeps
 * the production OpenAI adapter compatible with strict tool schemas without giving
 * the provider a different tool contract than the offline integration verifier.
 */
export function createAgentRetrievalTools(
  gateway: BudgetedRepositoryGateway
): readonly AgentRetrievalTool[] {
  return Object.freeze([
    {
      definition: {
        name: "list_files",
        description: "List repository-relative files recursively. Pass null for the repository root.",
        parameters: {
          type: "object",
          properties: {
            directory: { type: ["string", "null"] },
          },
          required: ["directory"],
          additionalProperties: false,
        },
      },
      execute: async (value: unknown) => {
        const args = asObject(value);
        const directory = nullableString(args.directory, "directory");
        return gateway.listFiles(directory === null ? {} : { directory });
      },
    },
    {
      definition: {
        name: "search",
        description: "Literal case-insensitive search over repository file contents.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      execute: async (value: unknown) => {
        const args = asObject(value);
        const query = requiredString(args.query, "query");
        return gateway.search({ query });
      },
    },
    {
      definition: {
        name: "read_chunk",
        description: "Read an inclusive line range from one repository-relative file. Pass null bounds to read from the start/to the end.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            startLine: { type: ["integer", "null"], minimum: 1 },
            endLine: { type: ["integer", "null"], minimum: 1 },
          },
          required: ["path", "startLine", "endLine"],
          additionalProperties: false,
        },
      },
      execute: async (value: unknown) => {
        const args = asObject(value);
        const path = requiredString(args.path, "path");
        const startLine = nullableInteger(args.startLine, "startLine");
        const endLine = nullableInteger(args.endLine, "endLine");
        return gateway.readChunk({
          path,
          startLine: startLine === null ? undefined : startLine,
          endLine: endLine === null ? undefined : endLine,
        });
      },
    },
  ] satisfies AgentRetrievalTool[]);
}

export function getAgentRetrievalToolDefinitions(
  tools: readonly AgentRetrievalTool[]
): readonly ResearchStatelessToolDefinition[] {
  return Object.freeze(
    tools.map((tool) =>
      Object.freeze({
        ...tool.definition,
        parameters: Object.freeze({ ...tool.definition.parameters }),
      })
    )
  );
}

export async function executeAgentRetrievalToolCall(
  tools: readonly AgentRetrievalTool[],
  call: AgentRetrievalToolCall
): Promise<BudgetedRetrievalResult> {
  const tool = tools.find((candidate) => candidate.definition.name === call.toolName);
  if (!tool) throw new Error(`Unknown AR retrieval tool: ${call.toolName}`);
  return tool.execute(call.arguments);
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be null or a positive integer`);
  }
  return value as number;
}
