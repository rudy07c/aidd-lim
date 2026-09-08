from pathlib import Path

plan_path = Path('docs/experiment_plan.md')
stage_path = Path('docs/stage1_plan.md')

plan = plan_path.read_text(encoding='utf-8')
stage = stage_path.read_text(encoding='utf-8')

# experiment_plan: v2.3 -> v2.4 and add current-model changelog.
if '**版**: v2.3' not in plan:
    raise RuntimeError('experiment_plan is not v2.3')
plan = plan.replace('**版**: v2.3', '**版**: v2.4', 1)

anchor = '**v2.3での変更点（Stage 1 primary model更新）**：'
if anchor not in plan:
    raise RuntimeError('v2.3 changelog anchor missing')

v24 = '''**v2.4での変更点（Stage 1 primary modelをLunaへ変更）**：
- Stage 1のprimary modelを **GPT-5.6 Luna**（API model ID: `gpt-5.6-luna`）へ変更
- Lunaはcost-sensitive / high-volume workloads向けのGPT-5.6 tierであり、大量のgeneration・repeatを必要とする本研究ではcost efficiencyを優先して採用する
- 採用は能力を無条件に仮定せず、Pre-Stage 1 calibrationでArtifact-Full条件のprimary taskがfloorにならないことをgateとして確認する
- main run前にreasoning effort・API設定・tool / structured-output設定をfreezeし、requested model IDとAPI response上のactual model identifierをrun provenanceへ保存する方針を維持

'''
plan = plan.replace(anchor, v24 + anchor, 1)

# Current planning text: update model references after the historical v2.3 changelog block.
# Preserve the historical v2.3 block by splitting at v2.2 changelog.
v22_anchor = '**v2.2での変更点（Stage 1 preflight freeze）**：'
if v22_anchor not in plan:
    raise RuntimeError('v2.2 changelog anchor missing')
head, rest = plan.split(v22_anchor, 1)
# head contains v2.4 + historical v2.3; keep Terra in the v2.3 history.
rest = rest.replace('GPT-5.6 Terra', 'GPT-5.6 Luna')
rest = rest.replace('gpt-5.6-terra', 'gpt-5.6-luna')
# Update current rationale if Terra-specific wording exists.
rest = rest.replace('Terraは現行GPT-5.6 familyのbalanced tierとして採用し、旧GPT-5系のmini tier相当の役割を担うモデルとして位置づける',
                    'Lunaは現行GPT-5.6 familyのcost-sensitive / high-volume tierとして採用し、大量反復におけるcost efficiencyを優先する')
plan = head + v22_anchor + rest

# stage1 plan: parent version and current primary-model statements.
stage = stage.replace('`docs/experiment_plan.md`（v2.3）', '`docs/experiment_plan.md`（v2.4）', 1)
stage = stage.replace('**Stage 1 primary model**：GPT-5.6 Terra（API model ID: `gpt-5.6-terra`）。Stage 1本実験前にreasoning effort・tool/structured-output設定・API設定をfreezeし、requested model IDとAPI response上のactual model identifierをrun provenanceへ保存する',
                      '**Stage 1 primary model**：GPT-5.6 Luna（API model ID: `gpt-5.6-luna`）。大量のgeneration / repeatを前提とするためcost efficiencyを優先して採用する。Pre-Stage 1 calibrationでArtifact-Fullのprimary taskがfloorにならないことを確認し、main run前にreasoning effort・tool/structured-output設定・API設定をfreezeする。requested model IDとAPI response上のactual model identifierはrun provenanceへ保存する', 1)

# Replace current Terra references throughout Stage 1 plan; this is a current implementation plan, not a versioned changelog.
stage = stage.replace('GPT-5.6 Terra', 'GPT-5.6 Luna')
stage = stage.replace('gpt-5.6-terra', 'gpt-5.6-luna')
stage = stage.replace('Terraは現行GPT-5.6 familyのbalanced tierであり、旧GPT-5系のmini tierに概ね対応する位置づけのため、Stage 1の反復実験で必要なcapability / cost balanceの基準モデルとして採用する。',
                      'Lunaは現行GPT-5.6 familyのcost-sensitive / high-volume tierであり、Stage 1の大量反復で必要なcost efficiencyを優先する基準モデルとして採用する。能力面は事前に仮定せず、Artifact-Full calibrationでprimary taskがfloorにならないことを採用gateとする。')

# Add/strengthen explicit model-floor gate in Stage 1 calibration if not already present.
gate_anchor = '### 10.1 AF baseline\n'
if gate_anchor in stage and 'Luna capability-floor gate' not in stage:
    addition = '''### 10.0.1 Luna capability-floor gate\n\nGPT-5.6 Lunaはcost efficiencyを優先して採用するため、main comparison前にmodel capability floorを明示的に検査する。Artifact-Fullで \\(\\mathcal T_{primary}\\) が恒常的に失敗する、または \\(R^{sem}\\) / \\(M\\) がfloorへ張り付く場合、そのtaskはchallenge setへ移す。primary task全体がfloorとなる場合のみ、model選択自体を再検討する。\n\nこのgateはLunaを有利に見せるためのpost-hoc task除外ではなく、context conditionを測定できるexperimental organismとして十分なheadroomがあるかをmain condition comparison前に確認するためのmeasurement calibrationである。\n\n'''
    stage = stage.replace(gate_anchor, addition + gate_anchor, 1)

plan_path.write_text(plan, encoding='utf-8')
stage_path.write_text(stage, encoding='utf-8')

print('Updated current Stage 1 primary model to GPT-5.6 Luna')
