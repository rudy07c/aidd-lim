from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {n}")
    return text.replace(old, new, 1)

# experiment_plan.md
p = Path('docs/experiment_plan.md')
text = p.read_text(encoding='utf-8')
text = replace_once(text, '**版**: v2.4', '**版**: v2.5', 'experiment version')
anchor = '**v2.4での変更点（Stage 1 primary modelをLunaへ変更）**：'
change = '''**v2.5での変更点（Batch APIをPre-Stage 1 P1の必須経路として明確化）**：
- GPT-5.6 Lunaのcost efficiencyを活かすため、OpenAI Batch APIをP1完了条件として実装する
- Batchは独立・tool-free request向けの**実行経路**として限定し、balanced semantic probe、Luna capability-floor calibration、static EL calibration等に使用する
- C1〜C3のprimary comparisonではBatch/Syncを混在させず、AF / EL / PR / ARを同一Sync execution modeへ揃える。PR/ARのinteractive retrieval、Stage 1Bの依存episode、Stage 1C longitudinal loopにはBatchを使用しない
- Batch実装はsync `AgentBackend.run()`へ無理に統合せず、同じResponses request body / structured-output schema / provenance normalizationを再利用する独立`BatchRunner`層として実装する
- Batch provenanceとしてbatch id、custom_id、endpoint、completion window、output/error file id、actual model、usage、request-level error、pricing modeを保存する

'''
text = replace_once(text, anchor, change + anchor, 'experiment changelog anchor')
p.write_text(text, encoding='utf-8')

# stage1_plan.md
p = Path('docs/stage1_plan.md')
stage = p.read_text(encoding='utf-8')
stage = stage.replace('`docs/experiment_plan.md`（v2.4）', '`docs/experiment_plan.md`（v2.5）', 1)
stage = stage.replace('2. `docs/experiment_plan.md`（v2.1）', '2. `docs/experiment_plan.md`（v2.5）', 1)
stage = stage.replace('\nプロジェクト上の現行方針としてStage 1 primary model候補をGPT-5.6 Lunaとする。\n\nStage 1本実験前に、実際に使用するmodel identifier、endpoint、reasoning設定等をfreezeする。\n', '\nStage 1本実験前に、実際に使用するmodel identifier、endpoint、reasoning設定等をfreezeする。\n', 1)

old_batch = '''### 3.4 Batch

Batchは**独立request**へ使用する。

向く：

- balanced semantic probe calibration
- static EL calibration
- AF fixed-S tasks
- Stage 1A repeat / variance pilot

初版で無理にBatch化しない：

- PR / ARのinteractive paging
- MOI→AF one-step comparisonで前段episode生成と依存する処理
- Stage 1C longitudinal generation loop

Batch / Syncを研究条件にはしない。
'''
new_batch = '''### 3.4 Batch API：P1で実装必須

GPT-5.6 Lunaをcost-sensitive / high-volume experimental modelとして採用するため、**P2へ進む前にOpenAI Batch API経路を実装する**。

Batchはprovider-neutral `AgentBackend.run()`そのものへ押し込まず、同じResponses request body・structured-output schema・model freeze設定・result normalizationを再利用する独立の`BatchRunner` / `OpenAIBatchClient`層として実装する。Batchは非同期jobであり、同期的な1 episode executionとはlifecycleが異なるためである。

最低実装要件：

1. 各requestをunique `custom_id`付きJSONLへserializeする
2. method=`POST`、url=`/v1/responses`を使用する
3. input fileをpurpose=`batch`でuploadする
4. `completion_window=24h`でbatch jobを作成する
5. batch status / request countsを取得できる
6. output file / error fileを取得し、`custom_id`で元requestへ対応付ける
7. response bodyからstructured mutation / probe answer、actual model、usage、request errorをsync pathと同じ研究用型へnormalizeする
8. Batch料金でcostを計算し、Sync料金と混同しない
9. batch id、input/output/error file id、custom_id、endpoint、completion window、status、pricing modeをprovenanceとして保存する

Batchを使うprimary用途：

- balanced semantic probe calibration
- Luna capability-floor calibration
- static EL calibration
- independent fixed-S AF calibration / variance pilot
- tool callを必要としない独立repeat

Batchを使わないprimary用途：

- C1〜C3のprimary condition comparison（AF / EL / PR / ARは同一Sync execution modeへ揃える）
- PR / ARのinteractive paging / retrieval
- Stage 1Bで前段episodeに依存するMOI / AF comparison
- Stage 1C longitudinal generation loop
- application-side custom function toolの結果を同一episode中に返す必要がある処理

したがってBatch / Syncは**研究条件ではなくexecution infrastructure**である。Batchによる50% discountや別rate-limit poolはexperiment throughput改善に利用するが、condition contrastへ混入させない。
'''
stage = replace_once(stage, old_batch, new_batch, 'stage batch section')

old_gate = '''**Gate P1**

- selected OpenAI modelでone-shot structured outputが動く
- function callingが動く
- usage/model provenanceが取れる
- independent calibration requestのBatch pathが動く
- existing Stage 0 mock regressionを壊していない
'''
new_gate = '''**Gate P1**

- selected OpenAI modelでSync one-shot structured outputが動く
- function callingが動く
- Sync pathでusage/model/error provenanceが取れる
- independent tool-free requestをBatch JSONLへserializeできる
- `/v1/responses` Batchをcreate / retrieve / output-error decodeできる
- Batch resultを`custom_id`で元requestへ対応付け、usage/model/error/cost provenanceを正規化できる
- Sync / Batchのpricing modeがlog上で区別される
- primary C1〜C3でBatch/Syncが混在しないことをconfig / runnerで検証できる
- existing Stage 0 mock regressionを壊していない
'''
stage = replace_once(stage, old_gate, new_gate, 'stage gate P1')
p.write_text(stage, encoding='utf-8')

print('Batch API plan synced to experiment_plan v2.5 and stage1_plan')
