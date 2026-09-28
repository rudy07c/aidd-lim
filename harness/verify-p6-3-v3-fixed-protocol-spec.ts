import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  FIXED_WORLD_PROTOCOL_SPEC,
  FIXED_WORLD_PROTOCOL_SPEC_FORBIDDEN_MARKERS,
  FIXED_WORLD_PROTOCOL_SPEC_VERSION,
} from "./src/context/fixed-world-protocol-spec";

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function main(): void {
  const repoRoot = path.resolve(__dirname, "..");
  const schemaPath = path.join(repoRoot, "synthetic-world", "schema.ts");
  const adapterPath = path.join(
    repoRoot,
    "synthetic-world",
    "repository",
    "src",
    "protocol_adapter.ts"
  );
  const schema = compact(fs.readFileSync(schemaPath, "utf8"));
  const adapter = fs.readFileSync(adapterPath, "utf8");
  const spec = compact(FIXED_WORLD_PROTOCOL_SPEC);

  const requiredSchemaFragments = [
    "reset(): WorldStateHandle;",
    "applyOperation(state: WorldStateHandle, operationDisplayName: string): OperationResult<WorldStateHandle>;",
    "getEntityState(state: WorldStateHandle, entityDisplayName: string): string;",
    "toAbstractSnapshot(state: WorldStateHandle): Record<EntityId, StateId>;",
  ];
  for (const fragment of requiredSchemaFragments) {
    assert(
      schema.includes(fragment),
      `WorldProtocol schema drifted; missing frozen contract fragment: ${fragment}`
    );
  }

  const requiredSpecFragments = [
    "reset(): WorldStateHandle;",
    "applyOperation( state: WorldStateHandle, operationDisplayName: string ):",
    "getEntityState( state: WorldStateHandle, entityDisplayName: string ): string;",
    "toAbstractSnapshot( state: WorldStateHandle ): Record<string, string>;",
  ];
  for (const fragment of requiredSpecFragments) {
    assert(
      spec.includes(compact(fragment)),
      `external protocol spec missing contract surface: ${fragment}`
    );
  }

  assert.match(
    adapter,
    /「文化的に継承されるartifact」ではなく、実験世界の固定された/,
    "protocol adapter no longer documents WorldProtocol as an external fixed boundary"
  );
  assert.match(
    adapter,
    /applyOperation\(world: WorldState, operationDisplayName: string\)/,
    "protocol adapter implementation does not expose the expected two-argument applyOperation"
  );

  for (const forbidden of FIXED_WORLD_PROTOCOL_SPEC_FORBIDDEN_MARKERS) {
    assert(
      !FIXED_WORLD_PROTOCOL_SPEC.includes(forbidden),
      `fixed protocol spec leaks forbidden repository/evaluator marker: ${forbidden}`
    );
  }

  assert(!FIXED_WORLD_PROTOCOL_SPEC.includes("protocol_adapter.ts must contain"));
  assert(!FIXED_WORLD_PROTOCOL_SPEC.includes("operationDisplayName ->"));

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        version: FIXED_WORLD_PROTOCOL_SPEC_VERSION,
        fixedMethods: [
          { name: "reset", arity: 0 },
          { name: "applyOperation", arity: 2 },
          { name: "getEntityState", arity: 2 },
          { name: "toAbstractSnapshot", arity: 1 },
        ],
        forbiddenMarkerCount: FIXED_WORLD_PROTOCOL_SPEC_FORBIDDEN_MARKERS.length,
        scientificOutcomesRead: false,
        hiddenEvaluatorContentRead: false,
        providerCallsMade: false,
      },
      null,
      2
    ) + "\n"
  );
}

main();
