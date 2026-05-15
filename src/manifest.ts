import { join, resolve } from "node:path";
import { fileExists, readJsonFile } from "./files.js";
import { isPathInside, isSafeRelativePath, normalizePackagePath } from "./paths.js";
import type { KnowledgeManifest } from "./types.js";

export type ManifestValidationResult =
  | { ok: true; manifest: KnowledgeManifest; errors: [] }
  | { ok: false; errors: string[] };

const NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export async function loadManifest(packageRoot: string): Promise<KnowledgeManifest> {
  const raw = await readJsonFile(join(packageRoot, "knowledge.json"));
  const result = await validateManifest(raw, { packageRoot });
  if (!result.ok) {
    throw new Error(`Invalid knowledge.json:\n${result.errors.join("\n")}`);
  }
  return result.manifest;
}

export async function validateManifest(
  raw: unknown,
  options: { packageRoot?: string } = {}
): Promise<ManifestValidationResult> {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }

  const manifest = normalizeManifest(raw);

  if (!NAME_RE.test(manifest.name)) {
    errors.push("name must be a lowercase npm-style package name");
  }
  if (!VERSION_RE.test(manifest.version)) {
    errors.push("version must be an exact semver version");
  }
  if (manifest.type !== "knowledge-package") {
    errors.push('type must be "knowledge-package"');
  }
  if (Object.keys(manifest.exports).length === 0) {
    errors.push("exports must expose at least one public markdown entry");
  }
  if (!manifest.exports["."]) {
    errors.push('exports must include "."');
  }
  if (manifest.context.entrypoints.length === 0) {
    errors.push("context.entrypoints must include at least one markdown file");
  }
  if (manifest.context.include.length === 0) {
    errors.push("context.include must include at least one pattern");
  }

  for (const [key, target] of Object.entries(manifest.exports)) {
    if (key !== "." && !key.startsWith("./")) {
      errors.push(`exports[${key}] must be "." or start with "./"`);
    }
    if (!isSafeRelativePath(target)) {
      errors.push(`exports[${key}] must stay inside the package`);
      continue;
    }
    if (!target.toLowerCase().endsWith(".md") && !target.includes("*")) {
      errors.push(`exports[${key}] must point to markdown files`);
    }
    if (options.packageRoot && !target.includes("*")) {
      const abs = resolve(options.packageRoot, normalizePackagePath(target));
      if (!isPathInside(options.packageRoot, abs)) {
        errors.push(`exports[${key}] must stay inside the package`);
      } else if (!(await fileExists(abs))) {
        errors.push(`exports[${key}] points to missing file: ${normalizePackagePath(target)}`);
      }
    }
  }

  for (const entry of manifest.context.entrypoints) {
    if (!isSafeRelativePath(entry)) {
      errors.push(`context.entrypoints contains unsafe path: ${entry}`);
      continue;
    }
    if (!entry.toLowerCase().endsWith(".md")) {
      errors.push(`context.entrypoints must be markdown files: ${entry}`);
    }
    if (options.packageRoot && !(await fileExists(join(options.packageRoot, normalizePackagePath(entry))))) {
      errors.push(`context.entrypoints points to missing file: ${entry}`);
    }
  }

  for (const [field, deps] of [
    ["dependencies", manifest.dependencies],
    ["knowledgeDependencies", manifest.knowledgeDependencies]
  ] as const) {
    for (const [name, range] of Object.entries(deps)) {
      if (!NAME_RE.test(name)) {
        errors.push(`${field} contains invalid package name: ${name}`);
      }
      if (!range) {
        errors.push(`${field}.${name} must be a non-empty source or semver range`);
      }
    }
  }

  return errors.length === 0 ? { ok: true, manifest, errors: [] } : { ok: false, errors };
}

export function normalizeManifest(raw: Record<string, unknown>): KnowledgeManifest {
  const context = isRecord(raw.context) ? raw.context : {};
  const wikilinks = isRecord(raw.wikilinks) ? raw.wikilinks : {};

  return {
    name: asString(raw.name),
    version: asString(raw.version),
    description: optionalString(raw.description),
    license: optionalString(raw.license),
    type: raw.type === "knowledge-package" ? "knowledge-package" : (asString(raw.type) as "knowledge-package"),
    exports: asStringRecord(raw.exports),
    context: {
      entrypoints: asStringArray(context.entrypoints, ["README.md"]),
      include: asStringArray(context.include, ["**/*.md"]),
      exclude: asStringArray(context.exclude, []),
      tags: asStringArray(context.tags, []),
      audience: asStringArray(context.audience, []),
      requireWikilinks: typeof context.requireWikilinks === "boolean" ? context.requireWikilinks : true
    },
    wikilinks: {
      caseSensitive: typeof wikilinks.caseSensitive === "boolean" ? wikilinks.caseSensitive : false,
      extensions: asStringArray(wikilinks.extensions, [".md"]),
      ambiguous:
        wikilinks.ambiguous === "first" || wikilinks.ambiguous === "warn" ? wikilinks.ambiguous : "error"
    },
    dependencies: asStringRecord(raw.dependencies),
    knowledgeDependencies: asStringRecord(raw.knowledgeDependencies)
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
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : fallback;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, val]) => [key, val])
  );
}
