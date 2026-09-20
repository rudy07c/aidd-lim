// Shared source of truth for provider/response statuses that censor scientific outcomes.
// Used by the orchestrator and P6 eligibility classification to prevent semantic drift.
import type { AgentExecutionStatus } from "./types";

export const CENSORED_AGENT_EXECUTION_STATUSES: ReadonlySet<AgentExecutionStatus> = new Set<AgentExecutionStatus>([
  "provider-error",
  "response-failed",
  "response-incomplete",
  "response-not-completed",
  "response-refusal",
]);

export function isCensoredAgentExecutionStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && (CENSORED_AGENT_EXECUTION_STATUSES as ReadonlySet<string>).has(status);
}
