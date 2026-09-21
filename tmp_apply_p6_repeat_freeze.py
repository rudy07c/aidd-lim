from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    return text.replace(old, new, 1)

# Freeze current design at 21 repeats from the fresh 11-task pilot.
p = Path("harness/src/p6/af-baseline.ts")
s = p.read_text()
s = replace_once(s, 'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v6-task-selection-freeze";', 'export const P6_2_AF_BASELINE_VERSION = "p6-2-af-baseline-v7-repeat21-freeze";', 'baseline version')
s = replace_once(s, 'export const P6_2_EQUIVALENCE_DESIGN_VERSION = "p6-2-equivalence-v3-11-task-selection-freeze";', 'export const P6_2_EQUIVALENCE_DESIGN_VERSION = "p6-2-equivalence-v4-11-task-repeat21-freeze";', 'equivalence version')
s = replace_once(s, '// Remains null until the fresh post-selection 11-task AF-vs-AF variance pilot is completed.\nexport const P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT: number | null = null;', '// Frozen from the fresh post-selection 11-task AF-vs-AF variance pilot recorded at\n// docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json.\n// Fresh sizing: M requiredN=21, Rsem requiredN=16, common repeat=21.\nexport const P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT: number | null = 21;', 'frozen repeat')
p.write_text(s)

# Baseline verifier: current default is now the frozen count.
p = Path("harness/verify-p6-af-baseline.ts")
s = p.read_text()
s = replace_once(s, 'assert.equal(P6_2_EQUIVALENCE_DESIGN_VERSION, "p6-2-equivalence-v3-11-task-selection-freeze");', 'assert.equal(P6_2_EQUIVALENCE_DESIGN_VERSION, "p6-2-equivalence-v4-11-task-repeat21-freeze");', 'verifier equivalence version')
s = replace_once(s, 'assert.equal(resolveP62RepeatCountSource(8), "runtime-argument-pre-freeze");\n  assert.equal(resolveP62RepeatCountSource(11, 11), "frozen-scientific-repeat-count");', 'assert.equal(resolveP62RepeatCountSource(21), "frozen-scientific-repeat-count");\n  assert.equal(resolveP62RepeatCountSource(11, 11), "frozen-scientific-repeat-count");', 'repeat source')
s = replace_once(s, 'assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, null);', 'assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, 21);', 'frozen count assertion')
s = replace_once(s, 'assertThrowsMessage(() => assertP62LiveRepeatCountFrozen(8), /scientific repeat count is not frozen/);', 'assert.doesNotThrow(() => assertP62LiveRepeatCountFrozen(21));\n  assertThrowsMessage(() => assertP62LiveRepeatCountFrozen(20), /does not match frozen repeat count 21/);', 'live freeze assertion')
p.write_text(s)

# Permanent historical/fresh verifier: bind the freeze to the committed fresh evidence.
p = Path("harness/verify-p6-af-variance-reanalysis.ts")
s = p.read_text()
s = replace_once(s, '  P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS,\n  P6_2_PRIMARY_TASK_IDS,', '  P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT,\n  P6_2_POST_PILOT_LOW_HEADROOM_TASK_IDS,\n  P6_2_PRIMARY_TASK_IDS,', 'fresh verifier import')
anchor = '  assert.equal(oskFailure.passed, false);\n\n'
fresh = '''  assert.equal(oskFailure.passed, false);\n\n  const freshPath = path.join(\n    repoRoot,\n    "docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json"\n  );\n  const fresh = JSON.parse(fs.readFileSync(freshPath, "utf8"));\n  assert.equal(fresh.status, "completed-awaiting-repeat-freeze");\n  assert.equal(fresh.manifest.gitSha, "6d133b480f90e297970991f1c10c8b016b32d066");\n  assert.equal(fresh.manifest.taskSelectionVersion, P6_2_TASK_SELECTION_VERSION);\n  assert.deepEqual(fresh.manifest.primaryTaskIds, [...P6_2_PRIMARY_TASK_IDS]);\n  assert.deepEqual(fresh.manifest.postPilotLowHeadroomTaskIds, ["T-crosscut-5"]);\n  assert.equal(fresh.manifest.deltaM, 1 / 11);\n  assert.equal(fresh.manifest.deltaR, 1 / 12);\n  assert.equal(fresh.acceptedPairs.length, 8);\n  assert.equal(fresh.sizing.needsAudit, false);\n  assert.equal(fresh.sizing.auditKind, null);\n  assert.equal(fresh.sizing.m.requiredN, 21);\n  assert.equal(fresh.sizing.rsem.requiredN, 16);\n  assert.equal(fresh.sizing.frozenScientificRepeatCount, 21);\n  assert(Math.abs(fresh.sizing.m.sampleSd - 0.07586572367238911) < 1e-12);\n  assert(Math.abs(fresh.sizing.m.rawSigmaUpper - 0.13634214080510762) < 1e-12);\n  assert(Math.abs(fresh.sizing.rsem.sampleSd - 0.05892556509887899) < 1e-12);\n  assert(Math.abs(fresh.sizing.rsem.rawSigmaUpper - 0.1058981224304308) < 1e-12);\n  assert.equal(P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT, 21);\n\n'''
s = replace_once(s, anchor, fresh, 'fresh evidence verifier insertion')
s = replace_once(s, '  console.log("  independent pre-pilot Osk-dependency evidence verified from oracle fixture and Stage 0.5 result");', '  console.log("  independent pre-pilot Osk-dependency evidence verified from oracle fixture and Stage 0.5 result");\n  console.log("  fresh 11-task pilot verified: M requiredN=21, Rsem=16, frozen repeat=21, needsAudit=false");', 'verifier log')
p.write_text(s)

# Stage 1 plan: preserve historical result and record the independent fresh sizing/freeze.
p = Path("docs/stage1_plan.md")
s = p.read_text()
old = 'historical 8 pairを11-taskへ再集約するとdiagnosticにM requiredN=21、Rsem requiredN=11となるが、**これはformal repeat freezeへ使用しない**。同じ8 pairがtask-selection evidenceとselection後varianceの双方へ使われるためpost-selection optimismを否定できない。formal sizingには、旧16 AF observationsを再利用しないfreshな11-task AF-vs-AF 8 pairを新規取得し、そのfresh dataのみからrequiredNを決める。fresh pilot開始後はtask membershipを一切変更しない。'
new = old + '\n\n**fresh 11-task variance pilot result / repeat freeze（2026-09-21）**：旧16 observationsを一切poolせず、新規8 accepted pairを取得した。Mはsample SD=`0.07586572367238911`、片側95% SD-UCB=`0.13634214080510762`、requiredN=`21`。Rsemはsample SD=`0.05892556509887899`、片側95% SD-UCB=`0.1058981224304308`、requiredN=`16`。したがってpredeclared rule `max(8,n_M,n_R)` によりscientific repeat countを**21**へfreezeする。fresh resultは `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json` にimmutable evidenceとして保存し、pilot dataはP6-2 AF baseline本取得へpoolしない。historical 12-task designはn<=30でpower不足（ceiling外診断n=37相当）だった事実を併記し、11-task amendmentによる結論変化を隠さない。'
s = replace_once(s, old, new, 'stage1 fresh result')
s = replace_once(s, 'repeat数はfresh 11-task AF-vs-AF variance pilotから決定し、historical 8 pairのpost-selection再集約値は正式freezeへ使用しない。', 'repeat数はfresh 11-task AF-vs-AF variance pilotのみから決定し、historical 8 pairのpost-selection再集約値は正式freezeへ使用しない。2026-09-21のfresh 8 pairではM requiredN=21、Rsem requiredN=16となったため、共通scientific repeat countを21へfreezeした。', 'stage1 section 11.1 freeze')
p.write_text(s)

# Experiment plan: bump version and record the completed fresh freeze.
p = Path("docs/experiment_plan.md")
s = p.read_text()
s = replace_once(s, '**版**: v2.7', '**版**: v2.8', 'experiment version')
marker = '**v2.7での変更点（Pre-Stage 1 P5.5完了・現在地同期）**：'
insert = '''**v2.8での変更点（P6-2 task-selection amendment / fresh variance repeat freeze）**：\n- historical 12-task AF-vs-AF variance pilotはimmutable evidenceとして保持し、n<=30ではM power不足（同じexact式をceiling外へ診断的に延長するとn=37相当）だった結果を保存\n- bank-wide auditとpre-pilot Osk依存証拠に基づき`T-crosscut-5`をhistorical `semantic-floor`へ遡及させず、P6-2+専用`post-pilot-low-headroom`として分離し、current primary M bankを11 taskでfreeze\n- post-selection optimismを避けるためhistorical 8 pairの11-task再集約N=21はdiagnostic-onlyとし、正式sizingには旧観測を再利用しないfresh 11-task AF-vs-AF 8 pairのみを使用\n- fresh pilotでM requiredN=21、Rsem requiredN=16、needsAudit=falseを確認し、predeclared `max(8,n_M,n_R)` ruleからscientific repeat countを**21**へfreeze\n- current marginは`Delta_M=1/11`, `Delta_R=1/12`、alpha=0.05、target power=0.80、片側95% SD-UCB、true exact paired-TOSTを維持\n\n'''
s = replace_once(s, marker, insert + marker, 'experiment v2.8 notes')
post = '**P6-2 post-pilot task-selection amendment（2026-09-21）**：historical 12-task AF-vs-AF variance pilotのraw resultを先にimmutable evidenceとして保存した後、bank-wide監査で`T-crosscut-5`だけが16 AF observations中4 success / 11 semantic failure / 1 protocol failure、かつ11 semantic failureが同一Osk guard欠落signatureへ収束することを確認した。これはhistorical P6-1b `semantic-floor`へ遡及分類せず、P6-2+専用の`post-pilot-low-headroom`としてprimary Mから除外する。Osk依存は2026-09-06のoracle fixture、同型failureは2026-09-07のStage 0.5 resultにpre-pilot evidenceがある。一方、AFでのlow-headroom頻度はpost-pilotに確定したため、historical 8 pairを11-taskで再集約したrequiredN_M=21 / Rsem=11はdiagnostic-onlyでformal freezeへ使わない。current task selectionを11 primaryへfreezeし、`Delta_M=1/11`, `Delta_R=1/12`としたうえで、旧16 observationsを再利用しないfresh 11-task AF-vs-AF 8 pairから正式repeat数を決める。historical 12-task結果（n<=30ではpower不足、ceiling外診断ではn=37相当）とfresh 11-task結果は最終報告で併記する。'
post2 = post + '\n\n**P6-2 fresh 11-task variance repeat freeze（2026-09-21）**：旧16 observationsを再利用しないfresh 8 accepted pairを取得し、M sample SD=`0.07586572367238911` / 95% SD-UCB=`0.13634214080510762` / requiredN=`21`、Rsem sample SD=`0.05892556509887899` / 95% SD-UCB=`0.1058981224304308` / requiredN=`16`、`needsAudit=false`を得た。predeclared `max(8,n_M,n_R)` ruleにより共通scientific repeat countを**21**へfreezeする。fresh resultは `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json` に保存し、AF baseline本取得へpoolしない。'
s = replace_once(s, post, post2, 'experiment fresh freeze')
p.write_text(s)

# A compact findings record that directly juxtaposes historical and fresh designs.
p = Path("docs/findings/p6_2_variance_repeat_freeze.md")
p.write_text('''# P6-2 variance pilot / scientific repeat freeze\n\n## Decision\n\nCurrent P6-2 scientific repeat count is **21**. The freeze is based only on the fresh 11-task AF-vs-AF variance pilot; historical observations used for task selection were not pooled into the formal sizing sample.\n\n## Historical 12-task design\n\n- primary M tasks: 12\n- Delta_M = 1/12\n- accepted AF-vs-AF pairs: 8\n- M sample SD: 0.09383263553830025\n- M one-sided 95% SD-UCB: 0.16863138961044855\n- exact power at n=30: 0.6816437585696477\n- requiredN within the predeclared n<=30 ceiling: none\n- diagnostic extension of the same exact formula beyond the ceiling: n=37\n- status: statistical-design-needs-audit\n- evidence: `docs/findings/evidence/p6-2-variance-pilot/result.json`\n\n## Task-selection amendment\n\nA bank-wide audit of the 12 historical primary tasks found only `T-crosscut-5` with persistent semantic failures (4 success / 11 semantic failure / 1 protocol failure; all 11 semantic failures share `boostTalFen: fails when Osk=nim`). The Osk dependency and same failure existed before the variance pilot, but persistent low-headroom frequency under Luna/AF was established post-pilot. Therefore the task is not retroactively relabeled historical `semantic-floor`; it is excluded from P6-2+ as `post-pilot-low-headroom`.\n\nThe old 8 pairs reaggregated to 11 tasks yield diagnostic M requiredN=21 and Rsem requiredN=11, but those values are explicitly not freeze-eligible because the same observations informed task selection.\n\n## Fresh 11-task design\n\n- primary M tasks: 11\n- Delta_M = 1/11\n- Delta_R = 1/12\n- accepted fresh AF-vs-AF pairs: 8\n- no historical AF observations pooled\n- M sample SD: 0.07586572367238911\n- M one-sided 95% SD-UCB: 0.13634214080510762\n- M requiredN: 21\n- Rsem sample SD: 0.05892556509887899\n- Rsem one-sided 95% SD-UCB: 0.1058981224304308\n- Rsem requiredN: 16\n- common repeat rule: max(8, 21, 16) = **21**\n- needsAudit: false\n- estimated pilot cost: USD 0.47460515\n- evidence: `docs/findings/evidence/p6-2-variance-pilot-fresh-11-task/result.json`\n\n## Interpretation\n\nThe two designs must remain visible together. The historical 12-task design did not satisfy the power target within n<=30, whereas the current 11-task design yields a feasible frozen repeat count of 21 on an independent fresh variance sample. This difference is partly a consequence of the explicit task-selection amendment; it must not be presented as though the original 12-task design itself had requiredN=21.\n''')
