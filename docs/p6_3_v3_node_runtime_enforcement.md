# P6-3 v3 OpenAI Node runtime enforcement

**Status:** pre-provider runtime hardening; no P6-3 v3 provider outcome exists

The final operator-side dry preflight exposed a concrete runtime mismatch: the installed `openai@7.10.0` declares `engines.node = ">=22.0.0"`, while the operator machine was running Node `v20.11.1`. The previous runtime gate recorded the Node version but did not fail when it was outside the SDK-supported engine range.

This hardening makes the installed OpenAI SDK engine declaration part of the fail-closed pre-live runtime contract.

## Runtime contract

`resolveP63V3RuntimeEnvironmentProvenance()` now requires all of the following before the final pre-live gate can pass:

1. the OpenAI SDK version in `package-lock.json` exists;
2. the installed OpenAI SDK version equals the lockfile version;
3. the OpenAI `engines.node` declaration exists in both the lockfile and installed `node_modules/openai/package.json`;
4. the two engine declarations are identical;
5. the current `process.version` satisfies that engine requirement.

The receipt records:

```text
nodeVersion
openaiSdkVersion
openaiSdkNodeEngine
packageLockSha256
```

For the currently locked `openai@7.10.0`, the required Node engine is:

```text
>=22.0.0
```

Node 20 therefore fails before any provider-capable path can be entered.

## Fail-closed range handling

The runtime helper intentionally supports only the simple minimum form currently frozen by the SDK:

```text
>=X.Y.Z
```

It does not implement a partial npm-semver evaluator. If a future OpenAI SDK changes the engine declaration to an unreviewed form, such as a caret, union, or compound range, pre-live fails and requires an explicit review rather than guessing compatibility.

## Scientific boundary

This change does not modify the P6-3 v3 scientific treatment or analysis:

- no change to `E_fixed`;
- no change to the final artifact selector;
- no change to B0–B4 / AF budgets;
- no change to M/Rsem task or probe membership;
- no change to repeats, margins, or co-gate;
- no change to the deterministic result finalizer;
- no provider call is made by the verifier.

This is an execution-environment support check discovered and corrected before the first v3 provider outcome.

## Operator boundary

After this hardening is merged, the operator must switch to a Node version satisfying the locked SDK engine (currently Node 22 or later), run `npm ci`, and rerun:

```bash
npm run p6:el-calibration-v3
```

The exact-main dry preflight must pass before paid/live authorization is considered.
