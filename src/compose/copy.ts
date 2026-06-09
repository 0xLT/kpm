import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileExists } from "../files.js";
import { indexInstalledPackages, type IndexedPackage } from "../installed.js";
import { resolveWikiLink, type LinkablePackage } from "../markdown/resolve.js";
import { rewriteWikiLinks } from "../markdown/wikilinks.js";
import type { WikiLink } from "../types.js";

export async function copyAndRewrite(projectRoot: string, vault: string): Promise<void> {
  const indexed = await indexInstalledPackages(projectRoot);
  if (indexed.length === 0) {
    return;
  }

  const packageMap = new Map<string, LinkablePackage>(indexed.map((pkg) => [pkg.name, pkg]));
  const errors: string[] = [];

  for (const pkg of indexed) {
    const packageDestRoot = join(projectRoot, vault, ...pkg.name.split("/"));
    await rm(packageDestRoot, { recursive: true, force: true });

    for (const file of pkg.files) {
      const sourcePath = join(pkg.root, file);
      const destPath = join(packageDestRoot, file);
      const content = await readFile(sourcePath, "utf8");
      const rewritten = file.endsWith(".md")
        ? rewriteWikiLinks(content, (link) => resolveStrict(pkg, file, link, packageMap, errors))
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

function resolveStrict(
  current: IndexedPackage,
  fromFile: string,
  link: WikiLink,
  packages: Map<string, LinkablePackage>,
  errors: string[]
): string | undefined {
  const resolved = resolveWikiLink(current, fromFile, link, packages);
  if (!resolved.ok) {
    errors.push(resolved.message);
    return undefined;
  }
  return resolved.target;
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
