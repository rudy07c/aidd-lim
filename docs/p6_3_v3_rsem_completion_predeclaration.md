# P6-3 v3 Rsem completion predeclaration

**Status:** provider-free completion-design freeze; paid scientific Rsem recollection is not authorized by this document  
**Treatment:** unchanged P6-3 v3 context/treatment  
**Analysis unit:** inherited frozen M + fresh Rsem  
**Run class:** `scientific-calibration-completion`

## 1. Why a split completion is being used

The original P6-3 v3 scientific calibration stopped fail-closed after all 792 planned M logical cells had completed and the second Rsem logical cell exhausted its allowed infrastructure attempts at the frozen 8,000-token Rsem output ceiling.

The stopped run is not resumed.

A separate, predeclared provider-envelope reliability audit subsequently qualified:

```text
Rsem maxOutputTokens = 32000
```

using 60 balanced valid reliability trials with zero provider-declared `max_output_tokens` censoring.

The audit calls are not scientific observations.

The completion design therefore adopts the previously identified Option B:

```text
frozen inherited M evidence: 792 cells
+
fresh scientific Rsem family: 72 cells
=
one versioned completion analysis unit
```

This avoids rerunning the already complete M family while refusing to mix the stopped run's partial Rsem observations into the new Rsem estimate.

## 2. Inherited M source

The only authorized inherited M source is the repository-promoted diagnostic state:

```text
docs/findings/evidence/p6-3-v3-live-diagnostic-stop/state.json
```

Its repository-copy SHA-256 is frozen as:

```text
13efea9b8cc00598e5341595344f125f2c1b6b08feef22384098be19a092b627
```

The source identity is:

```text
checkout SHA:
c6b078dae6a9f8536b9dd283e06ccb4384850d47

canonical plan hash:
9d3a3f92d6e169e10600e3caa01fecaed7efb7ee8383e9700abe24bb19b8b932

treatment provenance hash:
bd66dc16fde82faad539778a51652061656b752f67bc8f929e42b9fbadc62d11
```

The inherited M subset contains exactly:

```text
792 M attempts
792 effectiveValidity=valid
0 infrastructure-invalid M attempts
sequences 0..791 exactly once
132 M observations per arm
66 M observations per repeat
```

The canonicalized full M-attempt subset is additionally frozen by semantic SHA-256:

```text
eceeef0cf2f561f1b1b5f953668f80446dcdf44fca04568169f927a2e25a9f8c
```

The inherited M observations remain the primary M endpoint for this completion analysis. They are not rerun, reweighted, or selected based on their outcome.

## 3. Fresh Rsem collection

All Rsem observations used by the completion analysis must be newly collected.

The fresh family is:

```text
12 repeats x 6 arms = 72 Rsem logical cells
```

The canonical Rsem identities are exactly the Rsem cells from the frozen v3 864-cell plan, corresponding to original canonical sequences 792..863.

For the new collection they receive an independent collection sequence 0..71 while retaining their canonical v3 identity.

The complete 72-cell collection plan is frozen by SHA-256:

```text
b3ae8664f97ef93f7d0811c477a0737f6755a7a206f110e5914c15fab9ba2550
```

No Rsem observation from the stopped v3 run is reused, including the one valid Rsem observation at original sequence 792.

No reliability-audit response is reused.

## 4. Rsem execution envelope amendment

The scientific Rsem provider envelope changes exactly one execution-capacity parameter from the stopped v3 scientific run:

```text
maxOutputTokens: 8000 -> 32000
```

The numerical value is not chosen from scientific Rsem outcomes. It comes from the separately predeclared reliability audit that qualified 32k before this fresh scientific Rsem collection.

The scientific Rsem contract is:

```text
model             = gpt-5.6-luna
reasoningEffort   = high
maxOutputTokens   = 32000
requestTimeoutMs  = 180000
providerMaxRetries= 2
serviceTier       = default
promptCacheMode   = implicit
storeResponses    = false
executionMode     = sync
```

The reliability audit's `maxRetries=0` was audit instrumentation only and is not inherited into the scientific Rsem contract.

The maximum scientific attempts per logical cell remains 3.

## 5. Treatment invariants

The following are unchanged from the frozen P6-3 v3 treatment:

- `Context_EL(B) = E_fixed ∪ Exposure_artifact(B, S_select)`;
- B0/B1/B2/B3/B4/AF grid;
- artifact chunking;
- final static selector;
- 12-probe Rsem bank;
- `A-obfuscated` naming scheme;
- 12-repeat balanced execution schedule;
- `Delta_M = 1/11`;
- `Delta_R = 1/12`;
- conjunctive interior co-gate;
- minimum-`B_expose` tie-break;
- calibration-only / not Stage 1A confirmatory.

The fresh Rsem run must reconstruct the same run-fixed environment identity as the inherited source:

```text
world-protocol-surface-v1:9f8d38e1bb47b4cdd2d5f017e2df05551cf13e0b60a4e4a3c922e07ecfd3bb47:p6-3-v3-world-protocol-external-spec-v1:d1dda51bdaf12a86f3df7e174460f355b518f960062f4d68a8e0e56aa8ef921b:d1dda51bdaf12a86f3df7e174460f355b518f960062f4d68a8e0e56aa8ef921b
```

A different fixed-environment identity is a provenance mismatch and must fail closed.

## 6. Combined finalization rule

The completion finalizer may evaluate the existing v3 co-gate only after it has:

1. mechanically verified the exact inherited M source and all 792 M identities;
2. obtained exactly one valid fresh Rsem scientific observation for each of the 72 fresh Rsem cells;
3. verified the fresh Rsem treatment/fixed-environment identity;
4. verified there is no unresolved audit state;
5. excluded every stopped-v3 Rsem and reliability-audit observation.

The combined denominator remains the original scientific design:

```text
M:    792 logical observations
Rsem: 72 bank-level observations
Total analysis membership: 864
```

This is a versioned split-provenance completion analysis, not a claim that all 864 observations were generated in one runtime invocation.

## 7. Reliability evidence used for the amendment

The reliability finding is recorded at:

`docs/findings/p6_3_v3_rsem_reliability_audit.md`

The qualified audit result was:

```text
candidate                        = 32000
valid trials                     = 60
cap censoring                    = 0
non-cap infrastructure attempts  = 0
protocol-invalid attempts        = 0
interrupted attempts             = 0
```

The external raw audit archive fingerprint is:

```text
p6-3-v3-rsem-reliability-audit-2026-10-03T00-35-14-051Z.tar.gz
SHA-256:
15871172b675d6079909cee15ea2e226759a6a9ba7950a123dbbea44f5dc4817
```

The raw archive remains outside git.

## 8. Explicit prohibitions

This completion design does not permit:

- resuming the stopped v3 controller state;
- keeping the stopped run's first valid Rsem cell;
- treating audit calls as scientific Rsem;
- rerunning or replacing inherited M observations;
- selecting a different M subset;
- changing the capacity grid or margins;
- changing the Rsem probe bank;
- escalating to 64k because of semantic/scientific outcomes;
- using Rsem headroom diagnostics in the co-gate;
- pooling P6-3 v2 primary estimates.

If 32k scientific Rsem collection develops a new reliability problem, the collection must follow its separately frozen scientific failure/replacement protocol and fail closed where required. The 64k audit candidate is not automatically authorized for scientific use.

## 9. Authorization boundary

This document does not authorize paid Rsem recollection.

Before provider execution, the repository must additionally contain and verify:

- the inherited-M evidence loader/verifier;
- the exact fresh-72-cell plan and hash;
- the 32k scientific Rsem executor;
- controller/persistence/resume logic;
- split-provenance finalizer;
- final pre-live gate binding all source/frozen/operational evidence;
- explicit paid/live invocation authorization.

Until those are merged and green, provider execution remains blocked.
