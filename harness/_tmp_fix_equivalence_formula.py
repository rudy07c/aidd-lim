from pathlib import Path
p = Path("docs/stage1_plan.md")
text = p.read_text()
old = '''\\frac{(z_{0.95}+z_{0.90})\\sigma_U}{\\Delta}

ight)^2

ight
ceil'''
new = '''\\frac{(z_{0.95}+z_{0.90})\\sigma_U}{\\Delta}
\\right)^2
\\right\\rceil'''
if old not in text:
    raise SystemExit("malformed formula anchor not found")
text = text.replace(old, new, 1)
p.write_text(text)
print("equivalence formula repaired")
