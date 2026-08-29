/**
 * Synthetic Software World — Ground Truth Schema
 *
 * G_impl = (E, Q, O, T, D, I)
 *
 * 設計方針:
 * - すべてのIDは命名に依存しない抽象識別子（E1, O1, q1 等）とする。
 *   人間可読な命名（難読化シンボル vok/zef/tal、あるいは虚構語彙）は
 *   このGとは独立した NamingScheme として別途束縛し、repository/probe文面を
 *   レンダリングする際にのみ適用する。これにより命名方式A/Bの比較（計画書1.3節）を
 *   Gの意味構造を変えずに行える。
 * - Operation と TransitionRule を分離する（計画書1.2節 v1.1修正）。
 *   1 operation は複数entityに影響しうるが、v0では単純化のため
 *   1 operation = 1 entityの単一状態遷移 + 他entityへの precondition、とする。
 */

export type EntityId = string;   // e.g. "E1"
export type StateId = string;    // e.g. "q1"
export type OperationId = string; // e.g. "O1"
export type InvariantId = string; // e.g. "I1"
export type DependencyId = string; // e.g. "D1"

export interface Entity {
  id: EntityId;
  states: StateId[]; // 定義順は意味を持たない。初期状態は separately 指定。
  initialState: StateId;
}

export interface Operation {
  id: OperationId;
  parameters: string[]; // v0では常に空配列（引数なしoperationのみ扱う）
}

/** 他entityの状態に対する条件（precondition / invariantの条件節の両方で使う） */
export interface StateCondition {
  entity: EntityId;
  state: StateId;
}

/** 1 operationが1 entityへ及ぼす状態変化。1 operationは複数のEffectを持てる
 *  （例：kindleBothのように2 entityを同時に変更するoperation）。
 *  発見6（複合operationがschemaで表現できない）への対応として、
 *  TransitionRuleを単一entityの遷移から Effect[] へ拡張した（v0.2）。
 */
export interface Effect {
  entity: EntityId;
  fromState: StateId;
  toState: StateId;
}

export interface TransitionRule {
  operationId: OperationId;
  effects: Effect[];               // 1つ以上。複数なら複合operation
  preconditions: StateCondition[]; // 「他entity（または同entity）がこの状態でなければ実行不可」
}

/** Dependencyは D = { operation -> entity } の明示的な参照グラフ。
 *  TransitionRule.preconditions および TransitionRule.effects から機械的に
 *  導出可能だが、「どのoperationがどのentityに依存・作用しているか」を
 *  probe生成のために独立実体として持つ。
 */
export interface Dependency {
  id: DependencyId;
  from: OperationId;
  on: EntityId;
  note?: string; // 人間向け注記。probe生成には使わない。
}

/** Invariant: 「conditionが成立する状態では、requiresも常に成立していなければならない」
 *  TransitionRuleのpreconditionを満たしても、invariantは別経路からの違反を検出するために独立に保持する。
 *  （invariant-stressing taskの検証に必須。1.5節参照）
 */
export interface Invariant {
  id: InvariantId;
  description: string; // 人間向け説明。probe生成には使わない（機械判定はcondition/requiresのみで行う）。
  /**
   * 「守られているかどうか」ではなく「どう符号化されているか」を表すタグ。
   * - explicit: 単一のtransition preconditionが、この関係を直接チェックしている
   *   （例: I2はO4のpreconditionがE3=q2を直接要求）
   * - distributed: どの単一preconditionも直接この関係を述べていないが、
   *   複数のtransition precondition・状態の単調性（非後退性）の組み合わせにより、
   *   結果として到達可能な全状態で成立する
   * この分類は G が S ⊨ G を満たすことを妨げない。両者とも model_checker.ts で
   * 全到達可能状態にわたり成立が検証される必要がある（「破ってよいinvariant」ではない）。
   */
  encoding: "explicit" | "distributed";
  condition: StateCondition;
  requires: StateCondition;
}

export interface GroundTruth {
  worldId: string;
  entities: Entity[];
  operations: Operation[];
  transitions: TransitionRule[];
  dependencies: Dependency[];
  invariants: Invariant[];
}

/** NamingScheme: G上の抽象IDを表示名へ束縛するレンダリング層。
 *  Gの意味構造とは独立。命名方式A（難読化symbol）・B（虚構語彙）のいずれかを選ぶ。
 *
 *  stateNamesは (EntityId, StateId) のペアをキーとする。理由:
 *  異なるentityの同じStateId（例: E1のq1とE2のq1）は意味的に別物であり、
 *  グローバルに共有すると命名が意味の同一性を暗示してしまう危険がある
 *  （NOTES.md 発見3）。キーは `${entityId}::${stateId}` の文字列とする。
 */
export interface NamingScheme {
  schemeId: string;              // "A-obfuscated" | "B-fictional" 等
  entityNames: Record<EntityId, string>;
  stateNames: Record<string, string>;    // key: `${EntityId}::${StateId}`
  operationNames: Record<OperationId, string>;
}

export function stateNameKey(entity: EntityId, state: StateId): string {
  return `${entity}::${state}`;
}

/**
 * WorldProtocol — hidden evaluator（H(G)）が repository の内部実装を
 * 一切知らずに呼び出すための固定契約（外部公開境界条件）。
 *
 * 位置づけ: 「文化的に継承されるartifact」ではなく、実験世界の
 * 固定された外部境界条件である。worker AIはこの型そのものを
 * 意識する必要はない（命名スキームでレンダリングされた具体的な
 * 関数名・エクスポート構造を見るだけでよい）が、各世代のrepositoryは
 * 必ずこの契約を満たすエントリポイントを公開しなければならない。
 *
 * 重要な制約: このprotocolのoperationId/entityId/stateIdの語彙は、
 * Generation 0で確定した命名スキームのレンダリング結果（表示名）を
 * 使う。つまり「初期世代で公開されたAPI表面」が固定契約となり、
 * 以降の世代はこの表面さえ保てば内部構造を自由に変更してよい
 * （SlopCodeBench等の固定checkpointに相当する役割）。
 *
 * protocol自体にI1/I2等のsemantic knowledgeを含めてはならない
 * （invariantの存在をAIへ漏らすと実験が汚染される）。
 *
 * ---
 * 実験全体の構造（v0.2での整理）:
 *
 *   固定されるもの: WorldProtocol / context条件のルール / 評価方法そのもの
 *                    / agentに何を継承させるかという実験規則
 *   世代ごとに変わるもの: 要求 T_g / 正解世界 G_g / hidden evaluatorの
 *                          具体的内容 H(G_g) / artifact S_g
 *
 * すなわち実験は次の2本のtrajectoryを並走させる:
 *
 *   G_g --T_g--> G_{g+1}   （worker agentには非公開。GroundTruthDeltaで進む）
 *   S_g --AI(T_g)--> S_{g+1}   （worker agentが実際に変更するartifact）
 *
 * そして各世代で S_{g+1} ⊨ G_{g+1} を外部評価する。「S_gだけが進化し
 * Gは固定」という単純化ではなく、Gも要求ごとに進化する点が本質である。
 */
export interface OperationResult<WorldStateHandle = unknown> {
  success: boolean;
  newState?: WorldStateHandle; // successの場合のみ設定。immutableな新state
  error?: string;
}

export interface WorldProtocol<WorldStateHandle = unknown> {
  reset(): WorldStateHandle;
  applyOperation(state: WorldStateHandle, operationDisplayName: string): OperationResult<WorldStateHandle>;
  getEntityState(state: WorldStateHandle, entityDisplayName: string): string;
  /** protocolを満たすWorldStateHandleから、H(G)が内部で使う抽象GroundTruth座標系
   *  （EntityId -> StateId）へ変換する。命名スキームの逆写像を用いる。
   */
  toAbstractSnapshot(state: WorldStateHandle): Record<EntityId, StateId>;
}

/**
 * GroundTruthDelta — 1つのheld-out taskが要求する「正解世界の変化」。
 * worker agentには絶対に見せない（visibleInstructionのみ見せる）。
 *
 *   G_g --delta--> G_{g+1}
 *
 * v0では追加のみをサポートする（削除・変更は将来拡張）。
 */
export interface GroundTruthDelta {
  addEntities?: Entity[];
  addOperations?: Operation[];
  addTransitions?: TransitionRule[];
  addDependencies?: Dependency[];
  addInvariants?: Invariant[];
}

export function applyDelta(g: GroundTruth, delta: GroundTruthDelta): GroundTruth {
  return {
    worldId: g.worldId,
    entities: [...g.entities, ...(delta.addEntities ?? [])],
    operations: [...g.operations, ...(delta.addOperations ?? [])],
    transitions: [...g.transitions, ...(delta.addTransitions ?? [])],
    dependencies: [...g.dependencies, ...(delta.addDependencies ?? [])],
    invariants: [...g.invariants, ...(delta.addInvariants ?? [])],
  };
}

/**
 * ID uniqueness / canonicalization
 *
 * 「複数taskのdeltaを異なる順序で適用しても最終Gは同じ」という主張は、
 * 理論上は集合の合併として正しいが、applyDelta()の実装は配列を後ろに
 * 連結するため、配列としてのJSON表現は順序によって異なる。
 * 「意味として同じG」であるためには、
 *   (a) entity/operation/transition(operationId)/dependency/invariantの
 *       IDが重複しない（同じIDを異なる意味で2回追加していない）
 *   (b) 配列順を意味として扱わない（比較時はIDでsortする）
 * という条件が必要。以下はこの2つを機械的に保証するユーティリティ。
 */
export interface IdUniquenessReport {
  ok: boolean;
  duplicateEntityIds: EntityId[];
  duplicateOperationIds: OperationId[];
  duplicateTransitionOperationIds: OperationId[]; // 1 operationIdに複数TransitionRuleがあれば重複
  duplicateDependencyIds: DependencyId[];
  duplicateInvariantIds: InvariantId[];
}

function findDuplicates<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const dups = new Set<T>();
  for (const item of items) {
    if (seen.has(item)) dups.add(item);
    seen.add(item);
  }
  return [...dups];
}

export function checkIdUniqueness(g: GroundTruth): IdUniquenessReport {
  const duplicateEntityIds = findDuplicates(g.entities.map((e) => e.id));
  const duplicateOperationIds = findDuplicates(g.operations.map((o) => o.id));
  const duplicateTransitionOperationIds = findDuplicates(g.transitions.map((t) => t.operationId));
  const duplicateDependencyIds = findDuplicates(g.dependencies.map((d) => d.id));
  const duplicateInvariantIds = findDuplicates(g.invariants.map((i) => i.id));
  return {
    ok:
      duplicateEntityIds.length === 0 &&
      duplicateOperationIds.length === 0 &&
      duplicateTransitionOperationIds.length === 0 &&
      duplicateDependencyIds.length === 0 &&
      duplicateInvariantIds.length === 0,
    duplicateEntityIds,
    duplicateOperationIds,
    duplicateTransitionOperationIds,
    duplicateDependencyIds,
    duplicateInvariantIds,
  };
}

/** GをID順に正準化する。配列順の違いを意味の違いと誤認しないための比較用。 */
export function canonicalizeGroundTruth(g: GroundTruth): GroundTruth {
  const byId = <T extends { id: string }>(arr: T[]) => [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    worldId: g.worldId,
    entities: byId(g.entities).map((e) => ({ ...e, states: [...e.states].sort() })),
    operations: byId(g.operations),
    transitions: [...g.transitions].sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0)),
    dependencies: byId(g.dependencies),
    invariants: byId(g.invariants),
  };
}

/** 正準化した上での深い等価性比較。task順序を変えても最終Gが「意味として」同じかを検証するために使う。 */
export function groundTruthsEquivalent(a: GroundTruth, b: GroundTruth): boolean {
  return JSON.stringify(canonicalizeGroundTruth(a)) === JSON.stringify(canonicalizeGroundTruth(b));
}

export interface HeldOutTask {
  taskId: string;
  type: "local" | "cross_cutting" | "delayed_dependency" | "invariant_stressing";
  namingScheme: string;
  visibleInstruction: string;      // worker agentへ見せる指示文（命名スキームでレンダリング済み）
  groundTruthDelta: GroundTruthDelta; // worker agentには非公開。G_g -> G_{g+1} の差分
  introducedAtGeneration?: number;
  activatesAtGeneration?: number;
  note?: string;
}
