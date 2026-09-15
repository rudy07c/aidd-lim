import type {
  AgentExecutionStatus,
  NormalizedAgentError,
} from "../types";
import type { ResearchStatelessProviderTelemetry } from "../context/research-stateless-episode";

export type ResearchStatelessCensoredStatus = Extract<
  AgentExecutionStatus,
  | "provider-error"
  | "response-incomplete"
  | "response-failed"
  | "response-refusal"
  | "response-not-completed"
>;

/**
 * Provider/response failure produced by one fresh PR/AR inference step.
 *
 * This is deliberately distinct from RetrievedEpisodeRuntimeFailure. The latter
 * represents experiment/runtime failures such as E_max exhaustion or retrieval
 * policy errors. This class preserves the P1 censoring semantics so provider
 * failures cannot be mistaken for software-evolution outcomes.
 */
export class ResearchStatelessProviderFailure extends Error {
  readonly executionStatus: ResearchStatelessCensoredStatus;
  readonly normalizedError: NormalizedAgentError;
  readonly providerTelemetry: ResearchStatelessProviderTelemetry | null;
  readonly rawResponse: string;

  constructor(args: {
    executionStatus: ResearchStatelessCensoredStatus;
    normalizedError: NormalizedAgentError;
    providerTelemetry?: ResearchStatelessProviderTelemetry | null;
    rawResponse?: string;
  }) {
    super(args.normalizedError.message);
    this.name = "ResearchStatelessProviderFailure";
    this.executionStatus = args.executionStatus;
    this.normalizedError = { ...args.normalizedError };
    this.providerTelemetry = args.providerTelemetry
      ? {
          ...args.providerTelemetry,
          tokenUsage: args.providerTelemetry.tokenUsage
            ? { ...args.providerTelemetry.tokenUsage }
            : null,
        }
      : null;
    this.rawResponse = args.rawResponse ?? "";
  }
}

export function responseStatusToCensoredExecutionStatus(
  status: string | null | undefined
): ResearchStatelessCensoredStatus {
  if (status === "incomplete") return "response-incomplete";
  if (status === "failed") return "response-failed";
  return "response-not-completed";
}

export function inferProviderRetryable(error: { status?: number }): boolean {
  if (error.status === 408 || error.status === 409 || error.status === 429) return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return false;
}
