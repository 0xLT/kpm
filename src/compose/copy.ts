import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileExists, listPackageFiles } from "../files.js";
import { parseKnowledgeManifest } from "../manifest/knowledge.js";
import { rewriteWikiLinks } from "../markdown/wikilinks.js";
import type { WikiLink } from "../types.js";

type IndexedPackage = {
  name: string;
  files: Set<string>;
  root: string;
};

export async function copyAndRewrite(projectRoot: string, vault: string): Promise<void> {
  const modulesRoot = join(projectRoot, "knowledge_modules");
  if (!(await fileExists(modulesRoot))) {
    return;
  }

  const indexed = await indexInstalledPackages(modulesRoot);
  const errors: string[] = [];

  for (const pkg of indexed) {
    const packageDestRoot = join(projectRoot, vault, ...pkg.name.split("/"));
    await rm(packageDestRoot, { recursive: true, force: true });

    for (const file of pkg.files) {
      const sourcePath = join(pkg.root, file);
      const destPath = join(packageDestRoot, file);
      const content = await readFile(sourcePath, "utf8");
      const rewritten = file.endsWith(".md")
        ? rewriteWikiLinks(content, (link) => resolveStrict(pkg, file, link, indexed, errors))
        : content;
      await mkdir(dirname(destPath), { recursive: true });
      await writeFile(destPath, rewritten);
    }
  }

  await pruneStalePackageDirs(join(projectRoot, vault), indexed);

  if (errors.length > 0) {
    throw new Error(
      `compose: wikilink resolution failed (${errors.length} error${errors.length === 1 ? "" : "s"}):\n  - ${errors.join(
        "\n  - "
      )}`
    );
  }
}

async function indexInstalledPackages(modulesRoot: string): Promise<IndexedPackage[]> {
  const packageRoots: string[] = [];
  for (const entry of await readdir(modulesRoot, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scoped of await readdir(join(modulesRoot, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) {
          packageRoots.push(join(modulesRoot, entry.name, scoped.name));
        }
      }
    } else if (entry.isDirectory()) {
      packageRoots.push(join(modulesRoot, entry.name));
    }
  }

  const indexed: IndexedPackage[] = [];
  for (const root of packageRoots) {
    const manifest = parseKnowledgeManifest(JSON.parse(await readFile(join(root, "knowledge.json"), "utf8")));
    const files = await listPackageFiles(root, manifest.files);
    indexed.push({ name: manifest.name, files: new Set(files), root });
  }
  return indexed;
}

function resolveStrict(
  current: IndexedPackage,
  fromFile: string,
  link: WikiLink,
  indexed: IndexedPackage[],
  errors: string[]
): string | undefined {
  if (link.packageName) {
    const pkg = indexed.find((entry) => entry.name === link.packageName);
    if (!pkg) {
      errors.push(`${current.name}/${fromFile}: ${link.raw} -> package ${link.packageName} not installed`);
      return undefined;
    }
    const file = withMdExt(link.target);
    if (!pkg.files.has(file)) {
      errors.push(`${current.name}/${fromFile}: ${link.raw} -> ${link.packageName} has no file ${file}`);
      return undefined;
    }
    return `${pkg.name}/${stripMdExt(file)}`;
  }

  if (link.target.startsWith("./") || link.target.startsWith("../")) {
    const fromDir = posix.dirname(toPosix(fromFile));
    const resolved = posix.normalize(posix.join(fromDir, link.target));
    const candidate = withMdExt(resolved);
    if (!current.files.has(candidate)) {
      errors.push(`${current.name}/${fromFile}: ${link.raw} -> no file at ${candidate}`);
      return undefined;
    }
    return `${current.name}/${stripMdExt(candidate)}`;
  }

  const slug = link.target.toLowerCase();
  const matches: string[] = [];
  for (const candidate of current.files) {
    if (!candidate.endsWith(".md")) {
      continue;
    }
    if (posix.basename(candidate, ".md").toLowerCase() === slug) {
      matches.push(candidate);
    }
  }
  if (matches.length === 0) {
    errors.push(`${current.name}/${fromFile}: ${link.raw} -> no file matches "${link.target}" inside ${current.name}`);
    return undefined;
  }
  if (matches.length > 1) {
    errors.push(`${current.name}/${fromFile}: ${link.raw} -> ambiguous, matches: ${matches.join(", ")}`);
    return undefined;
  }
  return `${current.name}/${stripMdExt(matches[0])}`;
}

async function pruneStalePackageDirs(vaultRoot: string, indexed: IndexedPackage[]): Promise<void> {
  if (!(await fileExists(vaultRoot))) {
    return;
  }
  const valid = new Set(indexed.map((pkg) => pkg.name));
  for (const top of await readdir(vaultRoot, { withFileTypes: true })) {
    if (!top.isDirectory() || !top.name.startsWith("@")) {
      continue;
    }
    for (const inner of await readdir(join(vaultRoot, top.name), { withFileTypes: true })) {
      if (!inner.isDirectory()) {
        continue;
      }
      const pkgName = `${top.name}/${inner.name}`;
      if (!valid.has(pkgName)) {
        await rm(join(vaultRoot, top.name, inner.name), { recursive: true, force: true });
      }
    }
  }
}

function withMdExt(path: string): string {
  return path.endsWith(".md") ? path : `${path}.md`;
}

function stripMdExt(path: string): string {
  return path.replace(/\.md$/i, "");
}

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}
