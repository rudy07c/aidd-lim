from pathlib import Path

p = Path("harness/verify-p6-af-baseline.ts")
s = p.read_text()
count = s.count("repeatCount: 1")
if count < 2:
    raise SystemExit(f"expected at least 2 repeatCount: 1 fixtures, found {count}")
s = s.replace("repeatCount: 1", "repeatCount: 21")
old = "assert.equal(result.executionManifest.frozenScientificRepeatCount, null);"
if old not in s:
    raise SystemExit("missing frozenScientificRepeatCount verifier assertion")
s = s.replace(old, "assert.equal(result.executionManifest.frozenScientificRepeatCount, 21);", 1)
p.write_text(s)
