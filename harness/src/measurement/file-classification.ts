export type ArtifactFileCategory = "type_definition" | "fixed_contract" | "test" | "implementation";

export function normalizeRepositoryPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function isTestFile(filePath: string): boolean {
  const normalized = normalizeRepositoryPath(filePath);
  return (
    normalized.includes("/tests/") ||
    normalized.startsWith("tests/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".spec.ts")
  );
}

export function isFixedContractFile(filePath: string): boolean {
  return normalizeRepositoryPath(filePath).endsWith("protocol_adapter.ts");
}

export function isTypeDefinitionFile(content: string): boolean {
  return /^export\s+(type|interface)\s/m.test(content);
}

/** Order matters: protocol_adapter.ts can itself contain exported types. */
export function classifyArtifactFile(filePath: string, content: string): ArtifactFileCategory {
  if (isFixedContractFile(filePath)) return "fixed_contract";
  if (isTypeDefinitionFile(content)) return "type_definition";
  if (isTestFile(filePath)) return "test";
  return "implementation";
}
