import assert from "assert";
import {
  CONTEXT_CONDITION_NAMES,
  STAGE1_CONTEXT_CONDITION_NAMES,
  ContextCondition,
  ContextConditionName,
  getContextCondition,
  isStage1ContextConditionName,
} from "./src/types";
import { assembleContext } from "./src/context/assembler";

const expected: Record<Exclude<ContextConditionName, "full" | "simple-limited">, Omit<ContextCondition, "name" | "legacy">> = {
  MOI: {
    axis: "axis-a-inheritance-transmission",
    inheritance: "artifact-plus-observable-history",
    inheritsObservableHistory: true,
    repositoryAccess: "full",
    budget: { kind: "observable-record", finite: true },
  },
  AF: {
    axis: "hub",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "none", finite: false },
  },
  EL: {
    axis: "axis-a-inheritance-transmission",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "static-subset",
    budget: { kind: "static-exposure", finite: true },
  },
  PR: {
    axis: "axis-b-observation-retrieval",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "working-set", finite: true },
  },
  AR: {
    axis: "axis-b-observation-retrieval",
    inheritance: "artifact-only",
    inheritsObservableHistory: false,
    repositoryAccess: "full",
    budget: { kind: "working-set", finite: true },
  },
};

assert.deepStrictEqual(
  CONTEXT_CONDITION_NAMES,
  ["full", "simple-limited", "MOI", "AF", "EL", "PR", "AR"],
  "Stage 0 legacy names and Stage 1 names must all remain accepted"
);
assert.deepStrictEqual(
  STAGE1_CONTEXT_CONDITION_NAMES,
  ["MOI", "AF", "EL", "PR", "AR"],
  "Stage 1 condition ordering must remain explicit"
);

for (const name of STAGE1_CONTEXT_CONDITION_NAMES) {
  const descriptor = getContextCondition(name);
  assert.strictEqual(descriptor.name, name);
  assert.strictEqual(descriptor.legacy, false);
  assert.strictEqual(isStage1ContextConditionName(name), true);
  const { name: _name, legacy: _legacy, ...mechanism } = descriptor;
  assert.deepStrictEqual(mechanism, expected[name]);
}

assert.strictEqual(getContextCondition("MOI").inheritsObservableHistory, true);
for (const name of ["AF", "EL", "PR", "AR"] as const) {
  assert.strictEqual(getContextCondition(name).inheritsObservableHistory, false);
}
assert.strictEqual(getContextCondition("EL").repositoryAccess, "static-subset");
for (const name of ["MOI", "AF", "PR", "AR"] as const) {
  assert.strictEqual(getContextCondition(name).repositoryAccess, "full");
}
assert.strictEqual(getContextCondition("AF").budget.finite, false);
for (const name of ["MOI", "EL", "PR", "AR"] as const) {
  assert.strictEqual(getContextCondition(name).budget.finite, true);
}

assert.strictEqual(getContextCondition("full").legacy, true);
assert.strictEqual(getContextCondition("simple-limited").legacy, true);
assert.strictEqual(isStage1ContextConditionName("full"), false);
assert.strictEqual(isStage1ContextConditionName("simple-limited"), false);

const repository = {
  "src/a.ts": "export const a = 1;\n",
  "src/b.ts": "x".repeat(10_000),
};
assert.deepStrictEqual(assembleContext(repository, "full"), repository);
assert.deepStrictEqual(assembleContext(repository, "AF"), repository);
assert.deepStrictEqual(
  assembleContext(repository, "MOI"),
  repository,
  "P2 MOI must receive the same full current artifact as AF; history is injected separately"
);
const legacyLimited = assembleContext(repository, "simple-limited");
assert.ok(Object.values(legacyLimited).join("").length <= 6_000);

// P2 still must not silently approximate later finite-observation mechanisms.
for (const name of ["EL", "PR", "AR"] as const) {
  assert.throws(
    () => assembleContext(repository, name),
    new RegExp(`Context condition ${name} is defined but its execution semantics are not implemented yet`)
  );
}

console.log(JSON.stringify({
  status: "ok",
  legacy: ["full", "simple-limited"].map((name) => getContextCondition(name as "full" | "simple-limited")),
  stage1: STAGE1_CONTEXT_CONDITION_NAMES.map((name) => getContextCondition(name)),
  p2Executable: ["AF", "MOI"],
}, null, 2));
