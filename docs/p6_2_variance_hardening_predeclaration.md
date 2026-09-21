# P6-2 variance-pilot pre-live hardening addendum

**Status:** normative pre-live freeze. This addendum refines `docs/stage1_plan.md` §10.2.5a before any AF-vs-AF variance-pilot live call. The variance pilot and P6-2 AF baseline remain unexecuted after this change.

## Exact paired-TOST power

The former shifted-central-t calculation is superseded. For paired normal differences with true mean difference 0, let

\[
R=S/\sigma\sim \chi_{n-1}/\sqrt{n-1},\qquad
\lambda=\Delta\sqrt{n}/\sigma,
\]

and \(t_c=t_{1-\alpha,n-1}\). Conditional on \(R=r\), \(\bar D/(\sigma/\sqrt n)\sim N(0,1)\), and TOST accepts exactly when

\[
|\bar D| < \Delta-t_cS/\sqrt n.
\]

Therefore, for \(0\le r<\lambda/t_c\), conditional acceptance probability is

\[
2\Phi(\lambda-t_cr)-1,
\]

and the exact power used for sizing is

\[
Power(n)=\int_0^{\lambda/t_c}
\left[2\Phi(\lambda-t_cr)-1\right]
 f_{\chi_{n-1}/\sqrt{n-1}}(r)\,dr.
\]

The implementation evaluates this integral numerically. This is the same unknown-variance paired-TOST quantity represented by Owen's Q formulations; the earlier shifted-central-t shortcut is no longer accepted as `exact`.

## Frozen non-zero sigma floor

Because each primary bank has 12 discrete units and the variance pilot has only 8 paired AF-vs-AF observations, observing eight identical pair differences (including all zeros) is not taken as evidence that the population repeat SD is exactly zero. Before observing the live pilot, freeze

\[
\sigma_{floor,M}=\Delta_M=1/12,
\qquad
\sigma_{floor,R}=\Delta_R=1/12.
\]

For each outcome, retain the raw one-sided 95% chi-square SD upper bound \(\sigma_U\), but size on

\[
\sigma_{plan}=\max(\sigma_U,\sigma_{floor}).
\]

The floor is a conservative **planning assumption**, not an empirical confidence bound and not a claim that the true SD is at least one bank unit. It exists to prevent a degenerate `SD=0 -> n=8` decision from an 8-pair discrete pilot. The floor must not be changed after the pilot is observed.

## Audit semantics

Variance-pilot audit has two disjoint classes.

1. **execution audit**: system/other M failures and protocol/system R-sem failures that require artifact-level adjudication. These are handled by the variance-specific adjudication tool and may return a pair attempt to `running` or convert it to infrastructure replacement according to the frozen disposition.
2. **statistical-design audit**: exact paired-TOST target power 0.80 is not reached by `n <= 30`. This is not an execution failure and cannot be cleared by reclassifying an execution. It requires an explicit design decision; the runner does not silently use n=30.

R-sem protocol diagnostics are preserved per arm and pair as `attempted/evaluable/valid/failure`. Protocol-invalid R-sem observations are not converted to semantic accuracy for the primary paired variance.

## Repeat-count interpretation

The current AF-vs-AF pilot produces an **AF-noise reference planning value**. It estimates repeat count under AF-scale repeat variance and is not a formal guarantee that the same target power holds under EL, PR, or AR if those conditions have materially larger paired variance.

If a confirmatory design later requires power guaranteed against variance across all intended primary conditions, a future option is to run pre-comparison, variance-only calibration for P6-3 through P6-5 and freeze the maximum condition-specific \(\sigma_U\) (with the same pre-frozen floor and without using condition means/contrasts to tune the design). That extension is recorded for future consideration only and is **not implemented in the present hardening cycle**.

## Provenance and recovery

Before live execution, the variance-pilot manifest must freeze the equivalence margins, alpha, target power, SD-UCB confidence, sigma-floor version/values, min/max n, timeout/retry/output limits, prompt/schema versions and hashes, runner hash, critical-source fingerprint, task/repository/probe hashes, model/reasoning/SDK/Node versions, and pair/replacement policies.

Each M execution must atomically journal raw response, modified files, model provenance, test results, and runner/agent error metadata at `pair-N/attempt-K/<arm>/<task>/`. Resume must recover committed journal entries and must not repeat an already accepted pair.
