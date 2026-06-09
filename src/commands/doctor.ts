import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, listInstalledPackageRoots, listPackageFiles } from "../files.js";
import { readKpmConfig } from "../manifest/config.js";
import { readKnowledgeManifest } from "../manifest/knowledge.js";
import { readLockfile } from "../manifest/lock.js";
import { parseNote } from "../markdown/parse.js";
import { createLinkablePackage, resolveWikiLink, type LinkablePackage } from "../markdown/resolve.js";
import type { KnowledgeManifest } from "../types.js";

export type DoctorReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
};

type IndexedPackage = LinkablePackage & {
  root: string;
  manifest: KnowledgeManifest;
};

export async function doctor(projectRoot: string): Promise<DoctorReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const manifestPath = join(projectRoot, "knowledge.json");
  if (!(await fileExists(manifestPath))) {
    return { ok: false, errors: ["missing knowledge.json"], warnings, info };
  }

  const rootManifest = await readKnowledgeManifest(projectRoot);
  const cfg = await readKpmConfig(projectRoot);

  const rootFiles = await listPackageFiles(projectRoot, rootManifest.files, { excludes: [`${cfg.vault}/**`] });
  const rootPackage: IndexedPackage = {
    ...createLinkablePackage(rootManifest.name, rootFiles),
    root: projectRoot,
    manifest: rootManifest
  };
  const indexedPackages = [rootPackage, ...(await loadInstalledIndex(projectRoot, warnings))];
  const packages = new Map<string, LinkablePackage>(indexedPackages.map((pkg) => [pkg.name, pkg]));

  await reportLockfileSignals(projectRoot, rootManifest, info, warnings);

  for (const pkg of indexedPackages) {
    await inspectPackage(pkg, packages, errors);
  }

  return { ok: errors.length === 0, errors, warnings, info };
}

async function loadInstalledIndex(projectRoot: string, warnings: string[]): Promise<IndexedPackage[]> {
  const indexed: IndexedPackage[] = [];
  for (const root of await listInstalledPackageRoots(projectRoot)) {
    try {
      const manifest = await readKnowledgeManifest(root);
      const files = await listPackageFiles(root, manifest.files);
      indexed.push({ ...createLinkablePackage(manifest.name, files), root, manifest });
    } catch (error) {
      warnings.push(`could not index ${root}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return indexed;
}

async function inspectPackage(
  pkg: IndexedPackage,
  packages: Map<string, LinkablePackage>,
  errors: string[]
): Promise<void> {
  for (const file of [...pkg.files].filter((entry) => entry.toLowerCase().endsWith(".md"))) {
    const note = parseNote(file, await readFile(join(pkg.root, file), "utf8"));
    for (const link of note.wikilinks) {
      const resolved = resolveWikiLink(pkg, file, link, packages);
      if (!resolved.ok) {
        errors.push(resolved.message);
      }
    }
  }
}

async function reportLockfileSignals(
  projectRoot: string,
  rootManifest: KnowledgeManifest,
  info: string[],
  warnings: string[]
): Promise<void> {
  if (!(await fileExists(join(projectRoot, "knowledge.lock")))) {
    if (Object.keys(rootManifest.knowledgeDependencies).length > 0) {
      warnings.push("knowledge.lock not found - run `kpm add <source>` to resolve dependencies and generate it.");
    }
    return;
  }

  try {
    const lock = await readLockfile(projectRoot);
    for (const depName of Object.keys(rootManifest.knowledgeDependencies)) {
      if (!lock.packages[depName]) {
        warnings.push(`knowledge.lock is missing ${depName}; run \`kpm install\` to refresh it.`);
      }
    }
    for (const [name, pkg] of Object.entries(lock.packages)) {
      if (pkg.refType === "branch") {
        info.push(`${name} is pinned to mutable branch ref "${pkg.ref}" at commit ${pkg.commit.slice(0, 8)}.`);
      }
      for (const override of pkg.overriddenSpecs ?? []) {
        warnings.push(`${name} was requested as "${override.spec}" by ${override.requestedBy} but resolved to "${pkg.spec}".`);
      }
    }
  } catch (error) {
    warnings.push(`could not parse knowledge.lock: ${error instanceof Error ? error.message : String(error)}`);
  }
}
