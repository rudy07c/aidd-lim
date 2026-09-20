from pathlib import Path

p = Path('.github/apply_p6_postflight_fixes.py')
s = p.read_text(encoding='utf-8')
start = s.index('  const flawedJumpFen = oracleJumpFen.replace(')
end = s.index('  assert.notEqual(flawedJumpFen, oracleJumpFen, "failed to construct Tal-guard-omitting mock");', start)
replacement = '''  const talGuard = `  if (world.tal !== "pex") {
    throw new Error("jumpFen: requires Tal to be 'pex' (Invariant I6 guard)");
  }
`;
  const flawedJumpFen = oracleJumpFen.replace(talGuard, "");
'''
s = s[:start] + replacement + s[end:]
p.write_text(s, encoding='utf-8')
print('postflight generator fixed: exact-string Tal guard mock')
