// Stage 1 P2: observable interaction record used by MOI inheritance.
// The builder accepts only worker-visible/worker-generated inputs; evaluator-only data is
// deliberately absent from its input contract.

import * as crypto from "crypto";

export const OBSERVABLE_INTERACTION_SCHEMA_VERSION = "observable-interaction-v1" as const;
export const OBSERVABLE_TOKEN_COUNT_METHOD = "utf8-bytes-div4-v1" as const;
export const OBSERVABLE_WORKING_NOTE_MAX_CHARS = 600;

export type ObservableInteractionSource =
  | "ephemeral-rationale"
  | "task-feedback"
  | "artifact-redundant"
  | "mutation-metadata";

export interface ObservableTextItem {
  source: ObservableInteractionSource;
  content: string;
  tokenCount: number;
}

export interface ObservableToolEventItem {
  source: "artifact-redundant";
  callId: string;
  toolName: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error: string | null;
  tokenCount: number;
}

export interface ObservableAppliedChangeItem {
  source: "mutation-metadata";
  path: string;
  operation: "add" | "modify" | "delete";
  tokenCount: number;
}

export interface ObservableVisibleFeedbackItem {
  source: "task-feedback";
  sourceName: string;
  content: string;
  tokenCount: number;
}

export interface ObservableInteractionRecord {
  schemaVersion: typeof OBSERVABLE_INTERACTION_SCHEMA_VERSION;
  generation: number;
  taskId: string;
  visibleInstruction: ObservableTextItem;
  observableAssistantMessages: ObservableTextItem[];
  toolEvents: ObservableToolEventItem[];
  explicitWorkingNote: ObservableTextItem | null;
  appliedChanges: ObservableAppliedChangeItem[];
  appliedDiff: ObservableTextItem | null;
  visibleFeedback: ObservableVisibleFeedbackItem[];
  tokenCount: number;
  tokenCountMethod: typeof OBSERVABLE_TOKEN_COUNT_METHOD;
  sourceBreakdown: Record<ObservableInteractionSource, number>;
  contentHash: string;
}

export interface BuildObservableInteractionRecordInput {
  generation: number;
  taskId: string;
  visibleInstruction: string;
  observableAssistantMessages: string[];
  toolEvents: Array<{
    callId: string;
    toolName: string;
    arguments: unknown;
    result: unknown;
    ok: boolean;
    error?: string;
  }>;
  explicitWorkingNote: string | null;
  repositoryBefore: Record<string, string>;
  repositoryAfter: Record<string, string>;
  appliedDiff: string;
  /** Only feedback that was actually shown to the worker during the episode. */
  visibleFeedback?: Array<{ source: string; content: string }>;
}

export interface OperationalFullFeasibility {
  checked: boolean;
  feasible: boolean | null;
  method: "utf8-byte-upper-bound-v1" | "not-applicable";
  contextCapacityTokens: number | null;
  conservativeInputUpperBoundTokens: number | null;
  reservedOutputTokens: number | null;
}

const SOURCE_KEYS: ObservableInteractionSource[] = [
  "ephemeral-rationale",
  "task-feedback",
  "artifact-redundant",
  "mutation-metadata",
];

const ROOT_KEYS = new Set([
  "schemaVersion",
  "generation",
  "taskId",
  "visibleInstruction",
  "observableAssistantMessages",
  "toolEvents",
  "explicitWorkingNote",
  "appliedChanges",
  "appliedDiff",
  "visibleFeedback",
  "tokenCount",
  "tokenCountMethod",
  "sourceBreakdown",
  "contentHash",
]);

export function buildObservableInteractionRecord(
  input: BuildObservableInteractionRecordInput
): ObservableInteractionRecord {
  if (!Number.isInteger(input.generation) || input.generation < 0) {
    throw new Error("ObservableInteractionRecord generation must be a non-negative integer");
  }
  if (input.taskId.length === 0) throw new Error("ObservableInteractionRecord taskId must be non-empty");
  if (
    input.explicitWorkingNote !== null &&
    input.explicitWorkingNote.length > OBSERVABLE_WORKING_NOTE_MAX_CHARS
  ) {
    throw new Error(
      `Observable explicit working note exceeds ${OBSERVABLE_WORKING_NOTE_MAX_CHARS} characters`
    );
  }

  const visibleInstruction = textItem("task-feedback", input.visibleInstruction);

  // MOI is Maximal Observable Inheritance: do not make a post-hoc semantic decision about
  // whether an observable assistant response is redundant enough to discard. Structured
  // mutation responses often repeat information that is also present in repositoryAfter,
  // appliedDiff, and explicitWorkingNote; keep them verbatim and tag that channel as
  // artifact-redundant so later analysis/ablation can include or exclude it explicitly.
  const observableAssistantMessages = input.observableAssistantMessages.map((content) =>
    textItem("artifact-redundant", content)
  );

  const toolEvents: ObservableToolEventItem[] = input.toolEvents.map((event) => {
    const payload = {
      callId: event.callId,
      toolName: event.toolName,
      arguments: event.arguments,
      result: event.result,
      ok: event.ok,
      error: event.error ?? null,
    };
    return {
      source: "artifact-redundant",
      ...payload,
      tokenCount: estimateObservableTokens(stableStringify(payload)),
    };
  });

  const explicitWorkingNote = input.explicitWorkingNote === null
    ? null
    : textItem("ephemeral-rationale", input.explicitWorkingNote);
  const appliedChanges = deriveAppliedChanges(input.repositoryBefore, input.repositoryAfter);
  const appliedDiff = input.appliedDiff.length === 0
    ? null
    : textItem("mutation-metadata", input.appliedDiff);
  const visibleFeedback: ObservableVisibleFeedbackItem[] = (input.visibleFeedback ?? []).map((feedback) => ({
    source: "task-feedback",
    sourceName: feedback.source,
    content: feedback.content,
    tokenCount: estimateObservableTokens(`${feedback.source}\n${feedback.content}`),
  }));

  const sourceBreakdown: Record<ObservableInteractionSource, number> = {
    "ephemeral-rationale": 0,
    "task-feedback": 0,
    "artifact-redundant": 0,
    "mutation-metadata": 0,
  };
  addTokens(sourceBreakdown, visibleInstruction.source, visibleInstruction.tokenCount);
  for (const item of observableAssistantMessages) addTokens(sourceBreakdown, item.source, item.tokenCount);
  for (const item of toolEvents) addTokens(sourceBreakdown, item.source, item.tokenCount);
  if (explicitWorkingNote) addTokens(sourceBreakdown, explicitWorkingNote.source, explicitWorkingNote.tokenCount);
  for (const item of appliedChanges) addTokens(sourceBreakdown, item.source, item.tokenCount);
  if (appliedDiff) addTokens(sourceBreakdown, appliedDiff.source, appliedDiff.tokenCount);
  for (const item of visibleFeedback) addTokens(sourceBreakdown, item.source, item.tokenCount);

  const tokenCount = SOURCE_KEYS.reduce((sum, key) => sum + sourceBreakdown[key], 0);
  const withoutHash = {
    schemaVersion: OBSERVABLE_INTERACTION_SCHEMA_VERSION,
    generation: input.generation,
    taskId: input.taskId,
    visibleInstruction,
    observableAssistantMessages,
    toolEvents,
    explicitWorkingNote,
    appliedChanges,
    appliedDiff,
    visibleFeedback,
    tokenCount,
    tokenCountMethod: OBSERVABLE_TOKEN_COUNT_METHOD,
    sourceBreakdown,
  };

  const record: ObservableInteractionRecord = {
    ...withoutHash,
    contentHash: sha256(stableStringify(withoutHash)),
  };
  validateObservableInteractionRecord(record);
  return record;
}

/**
 * Fail-closed schema validator. Exact record keys prevent evaluator-only fields from being
 * appended post-hoc. Opaque tool arguments/results are allowed because they are data that was
 * actually shown through a worker-visible tool; P5 owns hidden-data isolation for tool access.
 */
export function validateObservableInteractionRecord(
  value: unknown
): asserts value is ObservableInteractionRecord {
  if (!isRecord(value)) throw new Error("ObservableInteractionRecord must be an object");
  assertExactKeys(value, ROOT_KEYS, "ObservableInteractionRecord");
  if (value.schemaVersion !== OBSERVABLE_INTERACTION_SCHEMA_VERSION) throw new Error("Unsupported ObservableInteractionRecord schemaVersion");
  if (!Number.isInteger(value.generation) || (value.generation as number) < 0) throw new Error("Invalid ObservableInteractionRecord generation");
  if (typeof value.taskId !== "string" || value.taskId.length === 0) throw new Error("Invalid ObservableInteractionRecord taskId");
  validateTextItem(value.visibleInstruction, new Set(["task-feedback"]), "visibleInstruction");
  validateArray(value.observableAssistantMessages, (item, index) =>
    validateTextItem(item, new Set(["artifact-redundant"]), `observableAssistantMessages[${index}]`)
  );
  validateArray(value.toolEvents, validateToolEvent);
  if (value.explicitWorkingNote !== null) {
    validateTextItem(value.explicitWorkingNote, new Set(["ephemeral-rationale"]), "explicitWorkingNote");
    if ((value.explicitWorkingNote as ObservableTextItem).content.length > OBSERVABLE_WORKING_NOTE_MAX_CHARS) {
      throw new Error("explicitWorkingNote exceeds configured bound");
    }
  }
  validateArray(value.appliedChanges, validateAppliedChange);
  if (value.appliedDiff !== null) validateTextItem(value.appliedDiff, new Set(["mutation-metadata"]), "appliedDiff");
  validateArray(value.visibleFeedback, validateVisibleFeedback);
  if (!Number.isInteger(value.tokenCount) || (value.tokenCount as number) < 0) throw new Error("Invalid ObservableInteractionRecord tokenCount");
  if (value.tokenCountMethod !== OBSERVABLE_TOKEN_COUNT_METHOD) throw new Error("Invalid ObservableInteractionRecord tokenCountMethod");
  if (!isRecord(value.sourceBreakdown)) throw new Error("Invalid ObservableInteractionRecord sourceBreakdown");
  assertExactKeys(value.sourceBreakdown, new Set(SOURCE_KEYS), "sourceBreakdown");
  for (const source of SOURCE_KEYS) {
    const count = value.sourceBreakdown[source];
    if (!Number.isInteger(count) || (count as number) < 0) throw new Error(`Invalid sourceBreakdown.${source}`);
  }
  const total = SOURCE_KEYS.reduce((sum, source) => sum + (value.sourceBreakdown as Record<string, number>)[source], 0);
  if (total !== value.tokenCount) throw new Error(`ObservableInteractionRecord tokenCount mismatch: expected=${total}, actual=${String(value.tokenCount)}`);
  if (typeof value.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.contentHash)) throw new Error("Invalid ObservableInteractionRecord contentHash");

  const { contentHash, ...withoutHash } = value;
  const expectedHash = sha256(stableStringify(withoutHash));
  if (contentHash !== expectedHash) throw new Error("ObservableInteractionRecord contentHash mismatch");
}

/**
 * Serialize only the observable episode content for successor input. Research metadata such as
 * source tags, token counts and hashes is logged but is not itself presented to the successor.
 */
export function serializeObservableInteractionForSuccessor(record: ObservableInteractionRecord): string {
  validateObservableInteractionRecord(record);
  const payload = {
    generation: record.generation,
    taskId: record.taskId,
    visibleInstruction: record.visibleInstruction.content,
    observableAssistantMessages: record.observableAssistantMessages.map((item) => item.content),
    toolEvents: record.toolEvents.map((event) => ({
      callId: event.callId,
      toolName: event.toolName,
      arguments: event.arguments,
      result: event.result,
      ok: event.ok,
      error: event.error,
    })),
    explicitWorkingNote: record.explicitWorkingNote?.content ?? null,
    appliedChanges: record.appliedChanges.map((change) => ({ path: change.path, operation: change.operation })),
    appliedDiff: record.appliedDiff?.content ?? null,
    visibleFeedback: record.visibleFeedback.map((feedback) => ({ source: feedback.sourceName, content: feedback.content })),
  };
  return stableStringify(payload);
}

export function estimateObservableTokens(value: string): number {
  return Math.ceil(Buffer.byteLength(value, "utf8") / 4);
}

/** Conservative byte-level upper bound used until P3 introduces canonical token counting. */
export function evaluateOperationalFullFeasibility(args: {
  applicable: boolean;
  contextFiles: Record<string, string>;
  visibleInstruction: string;
  previousInteractionRecord: ObservableInteractionRecord | null;
  reservedOutputTokens: number;
  contextCapacityTokens: number | null;
  fixedOverheadTokens?: number;
}): OperationalFullFeasibility {
  if (!args.applicable || args.contextCapacityTokens === null) {
    return {
      checked: false,
      feasible: null,
      method: "not-applicable",
      contextCapacityTokens: args.contextCapacityTokens,
      conservativeInputUpperBoundTokens: null,
      reservedOutputTokens: args.reservedOutputTokens,
    };
  }
  const fixedOverheadTokens = args.fixedOverheadTokens ?? 4096;
  let inputBytes = Buffer.byteLength(args.visibleInstruction, "utf8");
  for (const [path, content] of Object.entries(args.contextFiles)) {
    inputBytes += Buffer.byteLength(path, "utf8") + Buffer.byteLength(content, "utf8") + 32;
  }
  if (args.previousInteractionRecord) {
    inputBytes += Buffer.byteLength(
      serializeObservableInteractionForSuccessor(args.previousInteractionRecord),
      "utf8"
    );
  }
  const conservativeInputUpperBoundTokens = inputBytes + fixedOverheadTokens;
  const feasible =
    conservativeInputUpperBoundTokens + args.reservedOutputTokens < args.contextCapacityTokens;
  return {
    checked: true,
    feasible,
    method: "utf8-byte-upper-bound-v1",
    contextCapacityTokens: args.contextCapacityTokens,
    conservativeInputUpperBoundTokens,
    reservedOutputTokens: args.reservedOutputTokens,
  };
}

function textItem(source: ObservableInteractionSource, content: string): ObservableTextItem {
  return { source, content, tokenCount: estimateObservableTokens(content) };
}

function deriveAppliedChanges(
  before: Record<string, string>,
  after: Record<string, string>
): ObservableAppliedChangeItem[] {
  const items: ObservableAppliedChangeItem[] = [];
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const path of paths) {
    if (before[path] === after[path]) continue;
    const operation: "add" | "modify" | "delete" =
      before[path] === undefined ? "add" : after[path] === undefined ? "delete" : "modify";
    const payload = `${path}\n${operation}`;
    items.push({
      source: "mutation-metadata",
      path,
      operation,
      tokenCount: estimateObservableTokens(payload),
    });
  }
  return items;
}

function addTokens(
  breakdown: Record<ObservableInteractionSource, number>,
  source: ObservableInteractionSource,
  count: number
): void {
  breakdown[source] += count;
}

function validateTextItem(
  value: unknown,
  allowedSources: ReadonlySet<ObservableInteractionSource>,
  label: string
): void {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertExactKeys(value, new Set(["source", "content", "tokenCount"]), label);
  if (!allowedSources.has(value.source as ObservableInteractionSource)) {
    throw new Error(`${label}.source is not allowed: ${String(value.source)}`);
  }
  if (typeof value.content !== "string") throw new Error(`${label}.content must be a string`);
  if (!Number.isInteger(value.tokenCount) || (value.tokenCount as number) < 0) throw new Error(`${label}.tokenCount must be non-negative integer`);
  if (value.tokenCount !== estimateObservableTokens(value.content)) throw new Error(`${label}.tokenCount mismatch`);
}

function validateToolEvent(value: unknown, index: number): void {
  const label = `toolEvents[${index}]`;
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertExactKeys(value, new Set(["source", "callId", "toolName", "arguments", "result", "ok", "error", "tokenCount"]), label);
  if (value.source !== "artifact-redundant") throw new Error(`${label}.source must be artifact-redundant`);
  if (typeof value.callId !== "string" || typeof value.toolName !== "string") throw new Error(`${label} callId/toolName must be strings`);
  if (typeof value.ok !== "boolean") throw new Error(`${label}.ok must be boolean`);
  if (value.error !== null && typeof value.error !== "string") throw new Error(`${label}.error must be string|null`);
  if (!Number.isInteger(value.tokenCount) || (value.tokenCount as number) < 0) throw new Error(`${label}.tokenCount must be non-negative integer`);
}

function validateAppliedChange(value: unknown, index: number): void {
  const label = `appliedChanges[${index}]`;
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertExactKeys(value, new Set(["source", "path", "operation", "tokenCount"]), label);
  if (value.source !== "mutation-metadata") throw new Error(`${label}.source must be mutation-metadata`);
  if (typeof value.path !== "string") throw new Error(`${label}.path must be string`);
  if (!new Set(["add", "modify", "delete"]).has(String(value.operation))) throw new Error(`${label}.operation invalid`);
  if (!Number.isInteger(value.tokenCount) || (value.tokenCount as number) < 0) throw new Error(`${label}.tokenCount must be non-negative integer`);
}

function validateVisibleFeedback(value: unknown, index: number): void {
  const label = `visibleFeedback[${index}]`;
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertExactKeys(value, new Set(["source", "sourceName", "content", "tokenCount"]), label);
  if (value.source !== "task-feedback") throw new Error(`${label}.source must be task-feedback`);
  if (typeof value.sourceName !== "string" || typeof value.content !== "string") throw new Error(`${label} sourceName/content must be strings`);
  if (!Number.isInteger(value.tokenCount) || (value.tokenCount as number) < 0) throw new Error(`${label}.tokenCount must be non-negative integer`);
}

function validateArray(value: unknown, validator: (item: unknown, index: number) => void): void {
  if (!Array.isArray(value)) throw new Error("ObservableInteractionRecord field must be an array");
  value.forEach(validator);
}

function assertExactKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains forbidden/unrecognized field: ${key}`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`${label} missing required field: ${key}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) result[key] = sortForStableJson(value[key]);
  return result;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
