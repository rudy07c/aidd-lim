from pathlib import Path

FILES = [Path('docs/experiment_plan.md'), Path('docs/stage1_plan.md')]

for path in FILES:
    text = path.read_text(encoding='utf-8')
    text = text.replace('GPT-5 mini', 'GPT-5.6 Terra')
    text = text.replace('gpt-5-mini', 'gpt-5.6-terra')

    if path.name == 'experiment_plan.md':
        if '**版**: v2.2' not in text:
            raise RuntimeError('experiment_plan version is not v2.2')
        text = text.replace('**版**: v2.2', '**版**: v2.3', 1)
        anchor = '**v2.2での変更点（Stage 1 preflight freeze）**：'
        if anchor not in text:
            raise RuntimeError('v2.2 changelog anchor not found')
        changelog = '''**v2.3での変更点（Stage 1 primary model更新）**：
- Stage 1のprimary modelを **GPT-5.6 Terra**（API model ID: `gpt-5.6-terra`）へ更新
- Terraは現行GPT-5.6 familyのbalanced tierとして採用し、旧GPT-5系のmini tier相当の役割を担うモデルとして位置づける
- model tierの継続的更新と実験再現性を分離し、main run前にreasoning effort・API設定をfreezeし、requested model IDとAPI response上のactual model identifierをrun provenanceへ保存する方針を維持

'''
        text = text.replace(anchor, changelog + anchor, 1)

    if path.name == 'stage1_plan.md':
        text = text.replace('`docs/experiment_plan.md`（v2.2）', '`docs/experiment_plan.md`（v2.3）', 1)
        old = '**primary model候補**：GPT-5.6 Terra（プロジェクト上の現行方針）。Stage 1本実験前に利用可能なmodel identifier・reasoning設定・tool/structured-output設定を再確認しfreezeする'
        new = '**Stage 1 primary model**：GPT-5.6 Terra（API model ID: `gpt-5.6-terra`）。Stage 1本実験前にreasoning effort・tool/structured-output設定・API設定をfreezeし、requested model IDとAPI response上のactual model identifierをrun provenanceへ保存する'
        if old not in text:
            raise RuntimeError('stage1 primary-model header text not found after model replacement')
        text = text.replace(old, new, 1)

        # Strengthen the P1 model section without assuming a dated snapshot exists.
        marker = '### 3.1 primary model\n\n'
        if marker in text:
            replacement = '''### 3.1 primary model\n\nStage 1 primary modelは **GPT-5.6 Terra**（`gpt-5.6-terra`）とする。Terraは現行GPT-5.6 familyのbalanced tierであり、旧GPT-5系のmini tierに概ね対応する位置づけのため、Stage 1の反復実験で必要なcapability / cost balanceの基準モデルとして採用する。\n\nただしmodel tierの継続的更新と実験再現性は分離する。main run開始前に、利用可能なmodel identifier、reasoning effort、endpoint、tool / structured-output設定、retry policyをfreezeし、requested model IDとAPI response上のactual model identifierを必ず保存する。dated snapshotが利用可能な場合はその採用を優先検討するが、存在を前提にはしない。\n\n'''
            text = text.replace(marker, replacement, 1)

    if 'GPT-5 mini' in text or 'gpt-5-mini' in text:
        raise RuntimeError(f'old model reference remains in {path}')

    path.write_text(text, encoding='utf-8')

# Report any old model references elsewhere without modifying historical artifacts.
for path in Path('.').rglob('*'):
    if not path.is_file() or '.git' in path.parts or 'node_modules' in path.parts:
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except Exception:
        continue
    if 'GPT-5 mini' in text or 'gpt-5-mini' in text:
        print(f'OLD_MODEL_REFERENCE_OUTSIDE_PLAN: {path}')

print('Updated Stage 1 primary model to GPT-5.6 Terra')
