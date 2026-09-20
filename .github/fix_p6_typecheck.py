from pathlib import Path
p = Path('harness/p6-task-bank-eligibility-live.ts')
text = p.read_text(encoding='utf-8')
old = '''  console.log("P6-1 FULL TASK-BANK PREDECLARED RULE", JSON.stringify({\n    initialAttempts: P6_1_INITIAL_REPEATS,\n    maxAttempts: P6_1_MAX_ATTEMPTS,\n    maxTotalAttempts: selectedTasks.length * P6_1_MAX_ATTEMPTS,\n    ...DEFAULT_P6_1_ELIGIBILITY_RULE,\n'''
new = '''  console.log("P6-1 FULL TASK-BANK PREDECLARED RULE", JSON.stringify({\n    ...DEFAULT_P6_1_ELIGIBILITY_RULE,\n    maxTotalAttempts: selectedTasks.length * P6_1_MAX_ATTEMPTS,\n'''
if old not in text:
    raise SystemExit('duplicate predeclared rule block not found')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
