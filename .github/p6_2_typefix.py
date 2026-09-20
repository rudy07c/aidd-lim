from pathlib import Path

core = Path('harness/src/p6/af-baseline.ts')
s = core.read_text()
s = s.replace('  const partitionSet = new Set(expectedPartition);', '  const partitionSet = new Set<string>(expectedPartition);', 1)
core.write_text(s)

verify = Path('harness/verify-p6-af-baseline.ts')
s = verify.read_text()
s = s.replace('    const mRecovered = reconcileRepeatJournal(temp, []);', '    const mRecovered = reconcileRepeatJournal<typeof mJournalResult>(temp, []);', 1)
verify.write_text(s)
