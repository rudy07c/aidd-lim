from pathlib import Path
import json


def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {n}')
    return text.replace(old, new, 1)

# --- types.ts ---
path = Path('harness/src/types.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    'export type PricingMode = "sync" | "batch";\n',
    'export type PricingMode = "sync" | "batch";\nexport type RunClass = "historical" | "smoke" | "scientific-calibration" | "scientific-main";\n',
    'types runClass type',
)
text = replace_once(
    text,
    'export interface RunConfig {\n  experimentId: string;\n  lineageId: string;\n',
    'export interface RunConfig {\n  experimentId: string;\n  lineageId: string;\n  /** runの科学的位置づけ。freeze gateはstage名ではなくこの値で判定する。 */\n  runClass: RunClass;\n',
    'types RunConfig runClass',
)
path.write_text(text, encoding='utf-8')

# --- validate.ts ---
path = Path('harness/src/config/validate.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '  PromptCacheMode,\n  RunConfig,\n',
    '  PromptCacheMode,\n  RunClass,\n  RunConfig,\n',
    'validate import RunClass',
)
text = replace_once(
    text,
    'const CACHE_MODES: PromptCacheMode[] = ["implicit", "explicit"];\n',
    'const CACHE_MODES: PromptCacheMode[] = ["implicit", "explicit"];\nconst RUN_CLASSES: RunClass[] = ["historical", "smoke", "scientific-calibration", "scientific-main"];\n',
    'validate run classes',
)
text = replace_once(
    text,
    '    "experimentId", "lineageId", "backend", "condition", "model", "reasoningEffort", "stage",\n',
    '    "experimentId", "lineageId", "runClass", "backend", "condition", "model", "reasoningEffort", "stage",\n',
    'validate raw string list',
)
text = replace_once(
    text,
    '  const scientificOpenAI =\n    typeof value.stage === "string" && (value.stage.startsWith("stage1") || value.stage.startsWith("stage2")) &&\n    value.backend === "openai";\n',
    '  requireOwn(value, "runClass");\n  if (!RUN_CLASSES.includes(value.runClass as RunClass)) {\n    throw new Error(`Unsupported runClass: ${String(value.runClass)}`);\n  }\n\n  const scientificOpenAI =\n    (value.runClass === "scientific-calibration" || value.runClass === "scientific-main") &&\n    value.backend === "openai";\n',
    'validate scientific raw gate',
)
text = replace_once(
    text,
    '  if (!BACKENDS.includes(config.backend)) throw new Error(`Unsupported backend: ${config.backend}`);\n',
    '  if (!RUN_CLASSES.includes(config.runClass)) throw new Error(`Unsupported runClass: ${config.runClass}`);\n  if (!BACKENDS.includes(config.backend)) throw new Error(`Unsupported backend: ${config.backend}`);\n',
    'validate resolved runClass',
)
text = replace_once(
    text,
    '  const scientificLongitudinal = config.stage?.startsWith("stage1") || config.stage?.startsWith("stage2");\n  if (scientificLongitudinal) {\n',
    '  const scientificRun = config.runClass === "scientific-calibration" || config.runClass === "scientific-main";\n  if (scientificRun) {\n',
    'validate resolved scientific gate',
)
path.write_text(text, encoding='utf-8')

# --- orchestrator.ts ---
path = Path('harness/src/orchestrator.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    '  if (agentResult.executionStatus === "provider-error") {\n    throw new Error(`Provider infrastructure failure; generation invalid/censored: ${agentResult.error?.message ?? "unknown provider error"}`);\n  }\n',
    '  if (shouldCensorGeneration(agentResult.executionStatus)) {\n    throw new Error(`Provider/response failure; generation invalid/censored (${agentResult.executionStatus}): ${agentResult.error?.message ?? "no detail"}`);\n  }\n',
    'orchestrator censor check',
)
# Append exported helper for direct verification and reuse.
text += '''\n\nconst CENSORED_AGENT_STATUSES = new Set<AgentExecutionStatus>([\n  "provider-error",\n  "response-failed",\n  "response-incomplete",\n  "response-not-completed",\n  "response-refusal",\n]);\n\n/**\n * Provider/Responses transport・completion由来で、software evolutionの結果として\n * lineageへ取り込んではならないstatusだけをcensorする。\n * output-parse-failure / tool-error / mutation-validation-failureはagentがtaskを\n * 実際に試みた結果としてcensorしない。\n */\nexport function shouldCensorGeneration(status: AgentExecutionStatus): boolean {\n  return CENSORED_AGENT_STATUSES.has(status);\n}\n'''
path.write_text(text, encoding='utf-8')

# --- Add runClass explicitly to every existing harness config ---
config_dir = Path('harness/config')
for cfg_path in sorted(config_dir.glob('*.json')):
    data = json.loads(cfg_path.read_text(encoding='utf-8'))
    name = cfg_path.name
    if 'smoke' in name:
        run_class = 'smoke'
    else:
        # Existing Stage 0 configs are retained historical runs. There are no existing
        # scientific calibration/main configs yet.
        run_class = 'historical'
    if name == 'stage1-openai-smoke.json':
        run_class = 'smoke'
    # Insert after lineageId when possible for readability.
    out = {}
    inserted = False
    for k, v in data.items():
        out[k] = v
        if k == 'lineageId':
            out['runClass'] = run_class
            inserted = True
    if not inserted:
        out = {'runClass': run_class, **out}
    cfg_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# --- Focused verifier (no external API) ---
write('harness/verify-run-validity.ts', r'''import { shouldCensorGeneration } from "./src/orchestrator";
import { validateRawRunConfig } from "./src/config/validate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const status of [
  "provider-error",
  "response-failed",
  "response-incomplete",
  "response-not-completed",
  "response-refusal",
] as const) {
  assert(shouldCensorGeneration(status), `${status} must be censored`);
}
for (const status of ["ok", "output-parse-failure", "tool-error", "mutation-validation-failure"] as const) {
  assert(!shouldCensorGeneration(status), `${status} must not be censored`);
}

const scientificBase = {
  runClass: "scientific-calibration",
  stage: "arbitrary-name-not-stage1",
  backend: "openai",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  maxOutputTokens: 8192,
  requestTimeoutMs: 120000,
  maxRetries: 2,
  storeResponses: false,
  maxToolRounds: 4,
  serviceTier: "default",
  promptCacheMode: "implicit",
};
validateRawRunConfig(scientificBase);

let missingFreezeRejected = false;
try {
  const { maxRetries: _ignored, ...missing } = scientificBase;
  validateRawRunConfig(missing);
} catch {
  missingFreezeRejected = true;
}
assert(missingFreezeRejected, "scientific-calibration must enforce freeze independent of stage name");

let missingRunClassRejected = false;
try {
  validateRawRunConfig({ backend: "mock-noop", stage: "stage0" });
} catch {
  missingRunClassRejected = true;
}
assert(missingRunClassRejected, "runClass must be explicit in raw config");

validateRawRunConfig({ runClass: "historical", backend: "mock-noop", stage: "stage1-looking-name" });

console.log("Run validity verification passed.");
''')

# Add verification script.
path = Path('harness/package.json')
data = json.loads(path.read_text(encoding='utf-8'))
data['scripts']['verify:run-validity'] = 'ts-node verify-run-validity.ts'
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# --- Research finding record only; no mitigation implemented ---
write('docs/findings/output_serialization_bottleneck.md', '''# Output Serialization Bottleneck（Stage 1C前の要対応事項）\n\n**記録日**: 2026-09-08  \n**状態**: Open / 未対処  \n**適用期限**: Stage 1C着手前\n\n## 発見\n\n現在のrepository mutation protocolは、変更対象fileについて差分ではなく**完全なfile content**をmodelに再出力させる。したがって小さな変更であっても、大きなfileほどoutput token・serialization負荷が増える。\n\nこの仕様は、研究対象としているinheritance / observation bottleneckとは別に、実験装置自身が次のような独立の選択圧を作る可能性がある。\n\n> 大きなfileは変更コストが高い → 小さなfile・局所的moduleへ分割されたartifactの方が変更しやすい\n\nその結果、longitudinal experimentでmodularity・semantic locality・file-size分布の変化を観測した場合、それが有限contextへの適応なのか、full-file mutation output protocolへの適応なのかを分離できない可能性がある。\n\n## 研究上の意味\n\nこれは全条件に共通する固定的な実装制約ではあるが、artifact構造が世代ごとに変化するため、その負荷はlineage間・generation間で一定ではない。したがって単純な共通ノイズではなく、trajectoryと相互作用し得る。\n\n## Stage 1C前に必要な対応\n\nStage 1C開始前に、少なくとも次のいずれかを採用してこの圧力を統制または測定する。\n\n- patch / edit operation型mutation protocolへ変更する\n- full-file serialization burdenを明示的に計測し、独立要因として評価・統制する\n- それ以外の方法で、output serialization costと研究対象のcontext pressureを識別可能にする\n\n現時点では**発見の記録のみ**とし、mutation schema自体の変更には着手しない。\n''')

print('Applied runClass/censor fixes and recorded Output Serialization Bottleneck finding')
