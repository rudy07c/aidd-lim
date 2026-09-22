from pathlib import Path

p = Path("docs/stage1_plan.md")
s = p.read_text()
old1 = "Rsemについても、primary 12-probe bank、forced boolean answer semantics、parse / failure-domain semanticsをP6-2から維持する。ELで必要なcontext wrapper差以外にanswer protocolを変更しない。\n"
new1 = old1 + "\nAFをP6-3 dose-responseの上限anchorとして用いるため、**ELのfull static exposure時にworkerへ見えるartifact payloadがAFのartifact payloadと表現上同等であること**をstructural parity gateにする。file ordering / path framing / line metadata / raw content / separator等、意味以外のserialization差がbudgetと同時に変化しないようにする。exact parityを実装できない場合は、`EL-full` representation-controlを別に設けてAFとの差を先に診断し、parityが未解決のまま`AF`をEL dose-responseの同一continuum endpointとは扱わない。\n"
assert s.count(old1) == 1, s.count(old1)
s = s.replace(old1, new1)
old2 = "- mutation prompt / schema / parser / validation semanticsがP6-2 AF baselineと一致\n"
new2 = old2 + "- EL full static exposureとAFのmodel-visible artifact payload serialization parityがoffline検証済み（parity不能なら`EL-full` controlを別扱い）\n"
assert s.count(old2) == 1, s.count(old2)
s = s.replace(old2, new2)
p.write_text(s)
