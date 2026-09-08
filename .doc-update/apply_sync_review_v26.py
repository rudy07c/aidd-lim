from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {n}")
    return text.replace(old, new, 1)

# experiment plan
p = Path('docs/experiment_plan.md')
text = p.read_text(encoding='utf-8')
text = replace_once(text, '**版**: v2.5', '**版**: v2.6', 'version')
anchor = '**v2.5での変更点（Batch APIをPre-Stage 1 P1の必須経路として明確化）**：'
change = '''**v2.6での変更点（OpenAI Sync backend自己レビューによる内部妥当性hardening）**：
- PR/ARの`stateless request`をAPI object非継承だけでなく**model-internal reasoning非継承**として精密化し、`previous_response_id` / conversationに加えて`reasoning.encrypted_content`、compaction item、その他persisted reasoning stateをreasoning step間で持ち越すことを禁止
- bounded conditionではcondition runner / WorkingSetManagerをartifact evidenceの唯一のbudget authorityとし、provider backendによる二重truncateを禁止
- main runのAPI freeze対象にrequested service tier、prompt-cache policy、prompt/schema version/hashを追加し、freeze必須fieldはdefault適用後ではなく**raw config上の明示指定**を検査する
- provider/network/infrastructure failureはtask failureとして世代を進めず、frozen retry policyを使い切った後はrun/episodeをinvalidまたはcensoredとして扱う。model-originated output/mutation failureとは分離する
- explicit working noteは全条件で同じneutral wordingにし、「successorへ渡る」とworkerへ示唆しない。MOIだけが後段で実際に継承する
- Responses APIの`incomplete` / refusal等をgeneric output-parse failureと分離し、request-level status/detailsをprovenanceへ保存する方針を追加

'''
text = replace_once(text, anchor, change + anchor, 'changelog')
p.write_text(text, encoding='utf-8')

# stage1 plan
p = Path('docs/stage1_plan.md')
stage = p.read_text(encoding='utf-8')
stage = stage.replace('`docs/experiment_plan.md`（v2.5）', '`docs/experiment_plan.md`（v2.6）', 1)
stage = stage.replace('2. `docs/experiment_plan.md`（v2.5）', '2. `docs/experiment_plan.md`（v2.6）', 1)

old_freeze = '''### 3.3 model freeze

本run開始前に固定：

- provider
- model identifier
- snapshot / dated modelが利用可能ならそのidentifier
- reasoning effort
- max output
- structured-output schema
- tool policy
- retry policy
- timeout
- SDK version

requested modelとAPI response上のactual model idを両方logする。
'''
new_freeze = '''### 3.3 model / request freeze

本run開始前に固定：

- provider
- model identifier
- snapshot / dated modelが利用可能ならそのidentifier
- reasoning effort
- max output
- structured-output schemaのversion / hash
- system/common promptのversion / hash
- tool policy / tool schema version
- requested service tier（primary Sync runではproject setting依存の`auto`を避け、原則`default`を明示）
- prompt-cache policy（implicit / explicit等）
- retry policy
- timeout
- SDK version
- store / truncation policy

requested modelとAPI response上のactual model id、requested / actual service tierを両方logする。

**freeze必須fieldはraw config上で明示されていることを検査する。** `run.ts`等でdefaultを補った後に「値が存在する」ことだけを検査してはならない。これを許すと、設定ファイルに書かれていないprovider default / harness defaultがmain runへ混入してもfreeze済みと誤判定するためである。
'''
stage = replace_once(stage, old_freeze, new_freeze, 'model freeze')

# Add neutral working-note rule near observable boundary.
anchor_note = '''`ObservableInteractionRecord`はpost-hocに好きな情報を追加しない。

原則：
'''
note_insert = '''`ObservableInteractionRecord`はpost-hocに好きな情報を追加しない。

また、`explicitWorkingNote`を生成させる場合、そのprompt wordingは全条件で共通かつneutralにする。workerへ「successorへのhandoff」「次世代へ渡るnote」等と伝えない。AF等で実際には継承されないchannelをworkerが利用可能だと誤認すると、artifactへの外在化行動そのものを変える可能性があるためである。workerには単に**observable episode note**として事実・依存・riskを短く記録させ、MOIだけが後段のinheritance conditionとしてそのrecordを継承する。

原則：
'''
stage = replace_once(stage, anchor_note, note_insert, 'working note neutrality')

old_stateless = '''ただし「再アクセス可能」と「provider会話履歴に過去artifactが残り続ける」は別である。working-setからevictしたchunkがAPI thread historyに残れば \\(B_{work}\\) 制約を迂回できるため、PR / ARでは各reasoning stepを**stateless request**として再構築する。入力はcurrent \\(W_t\\) + bounded explicit memory + current task + fixed system/tool schemaのみとし、`previous_response_id`、provider thread、暗黙のmessage history等でevicted artifact evidenceを保持しない。
'''
new_stateless = '''ただし「再アクセス可能」と「provider会話履歴に過去artifactが残り続ける」は別である。working-setからevictしたchunkがAPI thread historyまたはmodel-internal continuation stateに残れば \\(B_{work}\\) 制約を迂回できるため、PR / ARでは各reasoning stepを**research-stateless request**として再構築する。入力はcurrent \\(W_t\\) + bounded explicit memory + current task + fixed system/tool schemaのみとする。

禁止するcontinuation stateには少なくとも以下を含む：

- `previous_response_id`
- provider conversation / thread
- prior assistant message historyを無制限に再送すること
- `reasoning.encrypted_content`
- Responses compaction item
- その他、modelのprior reasoning stateを次stepへ復元するopaque / persisted state

OpenAI API上で`store=false`かつreturned output itemsを手動再送する方式はAPI運用上はstatelessと呼べるが、本研究では**encrypted reasoning等がevict済みartifact evidenceを内包しうるためresearch-statelessとはみなさない**。PR / ARでは各stepを新しいinferenceとして起動し、必要な継続情報は明示的memoryへ外在化して \\(B_{work}\\) に算入する。

さらに、artifact evidenceのbudget enforcementはcondition runner / `WorkingSetManager`だけが行う。provider backendは受け取ったactive evidenceを勝手に再truncateしない。backend側の二重truncateは、selectorが選んだ \\(W_t\\) とmodelが実際に見た \\(W_t\\) をずらすため禁止する。
'''
stage = replace_once(stage, old_stateless, new_stateless, 'research stateless')

# Add infrastructure failure policy before Gate P1.
gate_anchor = '''**Gate P1**
'''
infra = '''### 3.5 Failure semantics

API / network / provider infrastructure failureとmodel-originated failureを分離する。

- provider timeout、5xx、rate-limit exhaustion等：frozen retry policy後も解消しなければepisode / runをinvalidまたはcensoredとし、**有効なgenerationとしてlineageを進めない**
- Responses `incomplete` / `failed` / refusal：response status / incomplete details / refusal情報を保存し、generic JSON parse failureへ潰さない
- valid responseだがstructured mutationを満たさない、またはmutation/path validationに失敗：model-originated protocol outcomeとして別statusで記録する
- harness内部例外：`provider-error`へ偽装せずharness/infrastructure errorとして停止する

この区別は、外部API障害を有限context条件のtask failureとして誤計上しtrajectoryへ混入させないために必要である。

'''
stage = replace_once(stage, gate_anchor, infra + gate_anchor, 'failure semantics')

# Strengthen Gate P1.
old_gate_tail = '''- Sync pathでusage/model/error provenanceが取れる
- independent tool-free requestをBatch JSONLへserializeできる
'''
new_gate_tail = '''- Sync pathでusage/model/error provenanceが取れる
- raw config上でfreeze必須fieldの明示指定を検査できる
- requested / actual service tier、prompt/schema version/hash、response incomplete/refusal detailsを記録できる
- provider/infrastructure failureでlineageを有効generationとして進めない
- independent tool-free requestをBatch JSONLへserializeできる
'''
stage = replace_once(stage, old_gate_tail, new_gate_tail, 'gate hardening')
p.write_text(stage, encoding='utf-8')

print('Applied v2.6 sync-backend review hardening')
