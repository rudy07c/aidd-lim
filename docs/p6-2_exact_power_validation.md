# P6-2 exact paired-TOST power external validation

Date: 2026-09-21

## Scope

This record closes the external-software validation gate for `exactPairedTostPowerAtZero()` used in P6-2 repeat planning. It does not freeze the scientific repeat count; that remains `null` until the AF-vs-AF variance pilot supplies `sigma_U` / `sigma_plan`.

## Mathematical target

For paired normal differences at true mean difference 0, with `df=n-1`, `lambda=Delta*sqrt(n)/sigma`, and `t_c=t_(1-alpha,df)`, the implementation evaluates

`Integral[0, lambda/t_c] {2*Phi(lambda - t_c*r) - 1} f_(chi_df/sqrt(df))(r) dr`.

This is algebraically the fourth Owen cumulative probability `O_4(df, t_c, -t_c, lambda, -lambda)` and matches the published OwenQ `ipowen4` integrand after change of variables.

## Independent checks

1. The OwenQ `ipowen4` x-space integral was independently reimplemented with SciPy adaptive quadrature. The original frozen fixtures matched at approximately machine precision.
2. GitHub Actions run `35565684947` installed and executed:
   - R 4.6.1 (2026-06-24)
   - PowerTOST 1.5.7
3. All 13 frozen `(n, sigma/Delta)` fixtures were evaluated through the public PowerTOST API:
   - `logscale=FALSE`
   - `theta1=-Delta`, `theta2=+Delta`, `theta0=0`
   - `design="paired"`
   - `method="exact"`
   - `CV=sigma/sqrt(2)`, which maps PowerTOST's paired `sem=CV*sqrt(2/n)` to `sigma/sqrt(n)`.
4. The same cases were evaluated directly through PowerTOST's internal Owen-Q exact kernel and, diagnostically, through `method="mvt"`.

## Results

- Maximum absolute difference, frozen fixture vs public `method="exact"`: `7.1675998469800106e-13`
- Maximum absolute difference, frozen fixture vs internal Owen-Q kernel: `7.1675998469800106e-13`
- Maximum absolute difference, public exact API vs internal Owen-Q kernel: `3.3306690738754696e-16`
- Maximum absolute difference, frozen fixture vs independent `method="mvt"` path: `7.3695487794456227e-06`

All predeclared acceptance thresholds passed. The external statistical-software validation gate is therefore complete.

## Consequence for P6-2

`P6_2_FROZEN_SCIENTIFIC_REPEAT_COUNT` must remain `null` until the AF-vs-AF variance pilot is actually run and its predeclared SD upper-bound / sigma-floor rule produces `sigma_plan`. The remaining uncertainty is empirical variance estimation, not the exact-power implementation.

No OpenAI live API call was made as part of this validation.
