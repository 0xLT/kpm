import { readFile, readdir } from "node:fs/promises";
import { basename, join, posix } from "node:path";
import { fileExists, listPackageFiles } from "../files.js";
import { parseKpmConfig } from "../manifest/config.js";
import { parseKnowledgeManifest } from "../manifest/knowledge.js";
import { readLockfile } from "../manifest/lock.js";
import { parseNote } from "../markdown/parse.js";
import { withoutMarkdownExtension } from "../paths.js";
import type { KnowledgeManifest, WikiLink } from "../types.js";

export type DoctorReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
};

type IndexedPackage = {
  name: string;
  root: string;
  manifest: KnowledgeManifest;
  files: Set<string>;
};

export async function doctor(projectRoot: string): Promise<DoctorReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const manifestPath = join(projectRoot, "knowledge.json");
  if (!(await fileExists(manifestPath))) {
    return { ok: false, errors: ["missing knowledge.json"], warnings, info };
  }

  const rootManifest = parseKnowledgeManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const cfg = (await fileExists(join(projectRoot, "kpm.config.json")))
    ? parseKpmConfig(JSON.parse(await readFile(join(projectRoot, "kpm.config.json"), "utf8")))
    : parseKpmConfig({});

  const rootFiles = await listPackageFiles(projectRoot, rootManifest.files, { excludes: [`${cfg.vault}/**`] });
  const rootPackage: IndexedPackage = {
    name: rootManifest.name,
    root: projectRoot,
    manifest: rootManifest,
    files: new Set(rootFiles)
  };
  const packages = new Map<string, IndexedPackage>([[rootPackage.name, rootPackage]]);
  for (const pkg of await loadInstalledIndex(projectRoot, warnings)) {
    packages.set(pkg.name, pkg);
  }

  await reportLockfileSignals(projectRoot, rootManifest, info, warnings);

  for (const pkg of packages.values()) {
    await inspectPackage(pkg, packages, errors);
  }

  return { ok: errors.length === 0, errors, warnings, info };
}

async function loadInstalledIndex(projectRoot: string, warnings: string[]): Promise<IndexedPackage[]> {
  const modulesRoot = join(projectRoot, "knowledge_modules");
  if (!(await fileExists(modulesRoot))) {
    return [];
  }

  const packageRoots: string[] = [];
  for (const entry of await readdir(modulesRoot, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scoped of await readdir(join(modulesRoot, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          packageRoots.push(join(modulesRoot, entry.name, scoped.name));
        }
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      packageRoots.push(join(modulesRoot, entry.name));
    }
  }

  const indexed: IndexedPackage[] = [];
  for (const root of packageRoots) {
    try {
      const manifest = parseKnowledgeManifest(JSON.parse(await readFile(join(root, "knowledge.json"), "utf8")));
      const files = await listPackageFiles(root, manifest.files);
      indexed.push({ name: manifest.name, root, manifest, files: new Set(files) });
    } catch (error) {
      warnings.push(`could not index ${root}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return indexed;
}

async function inspectPackage(
  pkg: IndexedPackage,
  packages: Map<string, IndexedPackage>,
  errors: string[]
): Promise<void> {
  for (const file of [...pkg.files].filter((entry) => entry.toLowerCase().endsWith(".md"))) {
    const note = parseNote(file, await readFile(join(pkg.root, file), "utf8"));
    for (const link of note.wikilinks) {
      const error = resolveForDoctor(pkg, file, link, packages);
      if (error) {
        errors.push(error);
      }
    }
  }
}

function resolveForDoctor(
  current: IndexedPackage,
  fromFile: string,
  link: WikiLink,
  packages: Map<string, IndexedPackage>
): string | undefined {
  if (link.packageName) {
    const targetPkg = packages.get(link.packageName);
    if (!targetPkg) {
      return `${current.name}/${fromFile}: ${link.raw} -> package ${link.packageName} not installed`;
    }
    const target = withMdExt(link.target);
    if (!targetPkg.files.has(target)) {
      return `${current.name}/${fromFile}: ${link.raw} -> ${link.packageName} has no note ${link.target}`;
    }
    return undefined;
  }

  if (link.target.startsWith("./") || link.target.startsWith("../")) {
    const resolved = posix.normalize(posix.join(posix.dirname(toPosix(fromFile)), link.target));
    const target = withMdExt(resolved);
    return current.files.has(target)
      ? undefined
      : `${current.name}/${fromFile}: ${link.raw} -> no file at ${target}`;
  }

  if (link.target.includes("/")) {
    const target = withMdExt(link.target);
    return current.files.has(target)
      ? undefined
      : `${current.name}/${fromFile}: ${link.raw} -> missing local note ${link.target}`;
  }

  const slug = link.target.toLowerCase();
  const matches = [...current.files].filter(
    (candidate) => candidate.endsWith(".md") && basename(withoutMarkdownExtension(candidate)).toLowerCase() === slug
  );
  if (matches.length === 0) {
    return `${current.name}/${fromFile}: ${link.raw} -> no file matches "${link.target}" inside ${current.name}`;
  }
  if (matches.length > 1) {
    return `${current.name}/${fromFile}: ${link.raw} -> ambiguous, matches: ${matches.join(", ")}`;
  }
  return undefined;
}

async function reportLockfileSignals(
  projectRoot: string,
  rootManifest: KnowledgeManifest,
  info: string[],
  warnings: string[]
): Promise<void> {
  if (!(await fileExists(join(projectRoot, "knowledge.lock")))) {
    if (Object.keys(rootManifest.knowledgeDependencies).length > 0) {
      warnings.push("knowledge.lock not found - run `kpm install` to generate it.");
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

function withMdExt(path: string): string {
  return path.endsWith(".md") ? path : `${path}.md`;
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}
