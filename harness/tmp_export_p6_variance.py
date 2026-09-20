from pathlib import Path
p=Path('harness/p6-af-baseline-live.ts')
s=p.read_text()
repls={
'interface HeldOutTask {':'export interface HeldOutTask {',
'interface MRepeatExecution {':'export interface MRepeatExecution {',
'interface ProbeMaterial {':'export interface ProbeMaterial {',
'function loadDirRecursive(':'export function loadDirRecursive(',
'function hashRepository(':'export function hashRepository(',
'function loadProbeMaterial(':'export function loadProbeMaterial(',
'async function runMRepeat(':'export async function runMRepeat(',
}
for a,b in repls.items():
    if a not in s: raise SystemExit(f'missing anchor {a}')
    s=s.replace(a,b,1)
p.write_text(s)
print('exports patched')
