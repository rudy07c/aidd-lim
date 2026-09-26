# P6-3 live calibration runner integration

**Status**: runner integrated and offline-verified; paid/live calibration has not been authorized or executed

## Purpose

This layer turns the previously frozen P6-3 design into an executable calibration runner without changing the scientific treatment.

The runner remains **calibration-only**. Its output is explicitly marked `runClass="scientific-calibration"`, `calibrationOnly=true`, and `confirmatoryStage1AEligible=false`. P6-3 calibration results therefore cannot be silently promoted into Stage 1A confirmatory evidence.

## Frozen normal workload

The runner constructs the exact predeclared workload:

- M: 11 frozen primary tasks × 12 repeats × 6 arms = **792 logical cells**;
- Rsem: one frozen 12-probe bank × 12 repeats × 6 arms = **72 logical cells**;
- total normal workload = **864 logical cells**.

For each repeat, the six arms use the frozen forward/reverse cyclic schedule from `p6-3-execution-protocol-v1`. The six arms of one task×repeat M block, or one repeat-level Rsem block, are contiguous in the execution plan.

## Context treatment

The scientific difference between arms remains only the model-visible repository evidence.

### EL arms

`B0` through `B4` use the already-frozen static exposure runtime:

- M: `assembleELTaskStaticExposure()`;
- Rsem: `assembleELRSemBankStaticExposure()`.

The unified pre-live gate immediately preceding execution recomputes the structural freeze from the same clean, stable checkout and requires exact equality with the committed structural manifest. The live CLI additionally checks the frozen full-repository token count and static payload hash before any paid/live path can be entered.

### AF arm

AF does **not** route through the EL selector. It supplies the actual full repository context directly and verifies that the AF-compatible static serialization still equals the frozen `T_EL` and repository payload hash.

For M, the runner deliberately separates:

- `contextFiles`: what the model is allowed to see for that arm;
- `evaluationRepository`: the complete repository against which returned mutations are applied and scored.

This prevents an EL subset from accidentally becoming the repository-under-test.

## M protocol parity

Every M scientific attempt creates a fresh `OpenAIBackend` with the frozen P6-2/P6-3 mutation contract:

- model `gpt-5.6-luna`;
- reasoning `high`;
- max output 7000;
- timeout 180000 ms;
- provider SDK retries 2;
- service tier `default`;
- implicit prompt cache;
- store=false;
- no tool continuation.

Returned mutation paths use the frozen P6-2-compatible validator. The modified files are merged into the complete evaluation repository, scored with the existing scoring path, and classified with the P6-2 M failure-domain semantics.

## Rsem protocol parity

Rsem directly reuses the historical exported P6-2 `runRSemRepeat()` implementation. The Rsem parity freeze fingerprints and verifies that historical source. Across P6-3 arms, only the supplied `contextFiles` changes; the 12-probe bank, prompt/schema, parser/scorer, provider settings, and failure-domain semantics remain fixed.

## Fresh/stateless Sync execution

Each logical attempt is a new one-shot Sync request. No agent conversation state or prior model output is carried from one arm to another. Provider/SDK `maxRetries=2` is separate from the scientific-cell replacement policy below.

## Scientific replacement and adjudication

Normal scientific domains (`none`, `semantic`, `protocol`, `system`) advance to the next arm according to the frozen protocol.

An `infrastructure` outcome stops before the next arm and creates an explicit audit flag. It is never automatically replaced. Only after explicit adjudication as `infrastructure-invalid` may the same logical cell run again, immediately, with `attempt+1`. A logical cell is limited to three scientific attempts.

An unclassified `other` outcome also stops for audit. It can be explicitly resolved as:

- `scientific-failure` → semantic scientific outcome and advance;
- `protocol-failure` → protocol scientific outcome and advance;
- `infrastructure-invalid` → same-cell replacement under the three-attempt limit.

## Crash-safe in-flight handling

Immediately before a provider call, the runner persists an `inFlight` marker containing the logical sequence and scientific attempt number.

If a process interruption leaves that marker without a committed attempt result, resume does **not** blindly repeat the call. Instead it:

1. journals the consumed attempt in `interruptedAttempts`;
2. clears the `inFlight` marker;
3. enters `needs-audit` with `uncertain-in-flight-attempt`;
4. requires explicit `infrastructure-invalid` adjudication before retrying;
5. continues with `attempt+1`, so an interrupted attempt still counts toward the three-attempt ceiling.

No semantic/protocol result can be invented for an interrupted call whose output was not durably observed.

## Persistence and resume contract

A state file records:

- exact checkout SHA verified by the unified pre-live gate;
- exact hashes of all four frozen P6-3 manifests;
- deterministic 864-cell plan hash;
- current logical-cell cursor and next scientific attempt;
- normal attempt records;
- interrupted-attempt records;
- audit state;
- accumulated estimated cost.

Resume is refused if the checkout SHA, manifest hashes, runner/state schema, or plan hash differs.

Each completed attempt also has its own atomic JSON artifact. Existing attempt artifacts are not silently overwritten.

## Paid/live authorization boundary

The CLI defaults to dry/offline mode. Dry mode runs the unified pre-live gate, rebuilds and validates the 864-cell plan, checks the full repository against the frozen structural values, and then stops.

A provider/API path additionally requires all four of:

1. `--live`;
2. `--authorize-paid-live=P6-3`;
3. `P6_3_LIVE_EXECUTION_ALLOWED=1`;
4. `OPENAI_API_KEY`.

The unified pre-live receipt itself always retains `liveAuthorized=false`; passing the scientific preflight never self-authorizes paid execution.

## Offline verification

`verify:p6-3-live-runner` uses a fake executor and makes zero provider calls. It verifies:

- exactly 864 / 792 / 72 normal logical cells;
- exact frozen six-arm forward/reverse order;
- branded pre-live token requirement;
- immediate stop on infrastructure outcomes;
- same-cell replacement only after explicit infrastructure-invalid adjudication;
- maximum three scientific attempts;
- `system` remains a scientific domain and advances;
- interrupted calls are journaled rather than blindly repeated;
- interrupted calls can be explicitly resolved and resume at `attempt+1`;
- all three explicit resolution paths for unclassified outcomes;
- replacement-attempt accounting.

Dedicated CI also executes the real CLI in dry mode with `P6_3_LIVE_EXECUTION_ALLOWED=0`, covering the repository/freeze/task/probe wiring without any paid API call.

## Remaining before paid/live calibration

Runner integration is not itself authorization to run the 864 calls. Before paid/live execution, the remaining gate is a final pre-live audit of:

- the merged runner checkout and CI evidence;
- the current call-count/cost assumptions;
- the result/adjudication persistence path;
- explicit user authorization for paid/live P6-3 calibration.
