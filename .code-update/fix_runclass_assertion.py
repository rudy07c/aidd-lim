from pathlib import Path

path = Path('harness/src/config/validate.ts')
text = path.read_text(encoding='utf-8')
old = 'export function validateRawRunConfig(value: unknown): asserts value is Partial<RunConfig> {'
new = 'export function validateRawRunConfig(value: unknown): asserts value is Partial<RunConfig> & { runClass: RunClass } {'
if text.count(old) != 1:
    raise RuntimeError(f'expected one validateRawRunConfig signature, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Fixed runClass assertion typing')
