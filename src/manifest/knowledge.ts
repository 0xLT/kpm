import { join } from "node:path";
import { fileExists, readJsonFile } from "../files.js";
import { isSafeRelativePath } from "../paths.js";
import type { KnowledgeManifest } from "../types.js";

const NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const KNOWN_KEYS = new Set([
  "name",
  "version",
  "description",
  "license",
  "type",
  "files",
  "entrypoint",
  "knowledgeDependencies"
]);

export type ValidationResult =
  | { ok: true; manifest: KnowledgeManifest }
  | { ok: false; errors: string[] };

export function parseKnowledgeManifest(raw: unknown): KnowledgeManifest {
  const result = validateKnowledgeManifest(raw);
  if (!result.ok) {
    throw new Error(`Invalid knowledge.json:\n${result.errors.join("\n")}`);
  }
  return result.manifest;
}

export async function readKnowledgeManifest(root: string): Promise<KnowledgeManifest> {
  return parseKnowledgeManifest(await readJsonFile(join(root, "knowledge.json")));
}

export async function readProjectManifest(root: string): Promise<KnowledgeManifest> {
  const path = join(root, "knowledge.json");
  if (!(await fileExists(path))) {
    throw new Error(`No knowledge.json found in ${root}. Run \`kpm init\` first.`);
  }
  return parseKnowledgeManifest(await readJsonFile(path));
}

export function validateKnowledgeManifest(raw: unknown): ValidationResult {
  if (!isRecord(raw)) {
    return { ok: false, errors: ["manifest must be a JSON object"] };
  }

  const errors: string[] = [];

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`unknown field "${key}" - v2 manifests only allow: ${[...KNOWN_KEYS].join(", ")}`);
    }
  }

  const name = asString(raw.name);
  if (!NAME_RE.test(name)) {
    errors.push("name must be a lowercase npm-style package name");
  }

  const version = asString(raw.version);
  if (!VERSION_RE.test(version)) {
    errors.push("version must be an exact semver version");
  }

  if (raw.type !== "knowledge-package") {
    errors.push('type must be "knowledge-package"');
  }

  const files = asStringArray(raw.files, ["**/*.md"]);
  if (files.length === 0) {
    errors.push("files must include at least one publish glob");
  }
  for (const pattern of files) {
    if (!isSafeRelativePath(stripGlob(pattern))) {
      errors.push(`files contains unsafe pattern: ${pattern}`);
    }
  }

  const entrypoint = typeof raw.entrypoint === "string" ? raw.entrypoint : "README.md";
  if (!isSafeRelativePath(entrypoint) || !entrypoint.toLowerCase().endsWith(".md")) {
    errors.push(`entrypoint must be a markdown file inside the package: ${entrypoint}`);
  }

  const knowledgeDependencies = asStringRecord(raw.knowledgeDependencies);
  for (const [depName, spec] of Object.entries(knowledgeDependencies)) {
    if (!NAME_RE.test(depName)) {
      errors.push(`knowledgeDependencies contains invalid package name: ${depName}`);
    }
    if (spec.trim() === "") {
      errors.push(`knowledgeDependencies.${depName} must be a non-empty source spec`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    manifest: {
      name,
      version,
      description: optionalString(raw.description),
      license: optionalString(raw.license),
      type: "knowledge-package",
      files,
      entrypoint,
      knowledgeDependencies
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : fallback;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function stripGlob(pattern: string): string {
  return pattern
    .split("/")
    .filter((segment) => !segment.includes("*"))
    .join("/") || ".";
}
