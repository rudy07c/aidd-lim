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
 */
export function createAgentRetrievalTools(
  gateway: BudgetedRepositoryGateway
): readonly AgentRetrievalTool[] {
  return Object.freeze([
    {
      definition: {
        name: "list_files",
        description: "List repository-relative files recursively, optionally under one directory.",
        parameters: {
          type: "object",
          properties: { directory: { type: "string" } },
          additionalProperties: false,
        },
      },
      execute: async (value: unknown) => {
        const args = asObject(value);
        const directory = optionalString(args.directory, "directory");
        return gateway.listFiles(directory === undefined ? {} : { directory });
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
            maxResults: { type: "integer", minimum: 1, maximum: 100 },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      execute: async (value: unknown) => {
        const args = asObject(value);
        const query = requiredString(args.query, "query");
        const maxResults = optionalInteger(args.maxResults, "maxResults");
        return gateway.search(maxResults === undefined ? { query } : { query, maxResults });
      },
    },
    {
      definition: {
        name: "read_chunk",
        description: "Read an inclusive line range from one repository-relative file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            startLine: { type: "integer", minimum: 1 },
            endLine: { type: "integer", minimum: 1 },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
      execute: async (value: unknown) => {
        const args = asObject(value);
        const path = requiredString(args.path, "path");
        const startLine = optionalInteger(args.startLine, "startLine");
        const endLine = optionalInteger(args.endLine, "endLine");
        return gateway.readChunk({ path, startLine, endLine });
      },
    },
  ] satisfies AgentRetrievalTool[]);
}

export function getAgentRetrievalToolDefinitions(
  tools: readonly AgentRetrievalTool[]
): readonly ResearchStatelessToolDefinition[] {
  return Object.freeze(tools.map((tool) => Object.freeze({ ...tool.definition })));
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

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label);
}

function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value as number;
}
