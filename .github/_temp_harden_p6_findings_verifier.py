from pathlib import Path

v = Path("harness/verify-p6-af-baseline-evidence.ts")
s = v.read_text()
needle = '''  const protocolByTaskAndReason = sortedRecord(countBy(protocolRows, (row: any) => `${row.taskId} :: ${row.failureReason}`));\n\n  const r = result.measurements.Rsem;\n'''
insert = '''  const protocolByTaskAndReason = sortedRecord(countBy(protocolRows, (row: any) => `${row.taskId} :: ${row.failureReason}`));\n  assert.deepEqual(protocolByTask, sortedRecord({\n    "T-crosscut-1": 1,\n    "T-crosscut-3": 1,\n    "T-crosscut-4": 2,\n    "T-delayed-2": 3,\n    "T-invariant-stress-3": 5,\n    "T-local-2": 1,\n    "T-local-3": 1,\n    "T-local-4": 3,\n    "T-local-5": 1,\n    "T-local-7": 1,\n  }));\n  assert.deepEqual(duplicateByPath, sortedRecord({\n    "src/fen/rules.ts": 3,\n    "src/osk/rules.ts": 1,\n    "src/protocol_adapter.ts": 1,\n    "src/rush/rules.ts": 3,\n    "src/rushZefFen.ts": 1,\n    "src/tal/rules.ts": 3,\n    "src/vok/rules.ts": 4,\n    "src/zef/rules.ts": 2,\n  }));\n  assert.deepEqual(protocolByTaskAndReason, sortedRecord({\n    "T-crosscut-1 :: Duplicate modified file path: src/protocol_adapter.ts": 1,\n    "T-crosscut-3 :: Duplicate modified file path: src/osk/rules.ts": 1,\n    "T-crosscut-4 :: Duplicate modified file path: src/fen/rules.ts": 2,\n    "T-delayed-2 :: Duplicate modified file path: src/tal/rules.ts": 3,\n    "T-invariant-stress-3 :: Duplicate modified file path: src/rush/rules.ts": 3,\n    "T-invariant-stress-3 :: Duplicate modified file path: src/rushZefFen.ts": 1,\n    "T-invariant-stress-3 :: Duplicate modified file path: src/zef/rules.ts": 1,\n    "T-local-2 :: write-outside-repository-contract:workingNote": 1,\n    "T-local-3 :: Duplicate modified file path: src/fen/rules.ts": 1,\n    "T-local-4 :: Duplicate modified file path: src/vok/rules.ts": 3,\n    "T-local-5 :: Duplicate modified file path: src/zef/rules.ts": 1,\n    "T-local-7 :: Duplicate modified file path: src/vok/rules.ts": 1,\n  }));\n\n  const r = result.measurements.Rsem;\n'''
assert s.count(needle) == 1, s.count(needle)
s = s.replace(needle, insert)
needle2 = '  assert.equal(r11.derivedFrom?.candidateSource, "reachable-counterexample");\n'
replace2 = needle2 + '  assert.equal(r11.derivedFrom?.matchedInvariantId, "I1");\n'
assert s.count(needle2) == 1, s.count(needle2)
s = s.replace(needle2, replace2)
v.write_text(s)

f = Path("docs/findings/stage1_findings.md")
fs = f.read_text()
if not fs.endswith("\n"):
    f.write_text(fs + "\n")
