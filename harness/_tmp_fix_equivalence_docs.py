from pathlib import Path

paths = [Path("docs/stage1_plan.md"), Path("docs/experiment_plan.md")]
repls = {
    b"\x0crac": b"\\frac",
    b"\x07pprox": b"\\approx",
    b"\x07lpha": b"\\alpha",
    b"\x0dight": b"\\right",
    b"\x0dceil": b"\\rceil",
}
for p in paths:
    data = p.read_bytes()
    before = data
    for old, new in repls.items():
        data = data.replace(old, new)
    if data == before:
        raise SystemExit(f"no repair applied to {p}")
    if any(x in data for x in [b"\x07", b"\x0c", b"\x0d"]):
        # CRLF is not used in these markdown files; any remaining control char is suspicious.
        raise SystemExit(f"unexpected control char remains in {p}")
    p.write_bytes(data)
print("equivalence docs control-character repair applied")
