import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listMarkdownFiles } from "./files.js";
import { loadManifest } from "./manifest.js";
import { extractHeadings, extractWikiLinks, parseFrontmatter, slugifyHeading } from "./markdown.js";
import { normalizePackagePath, withMarkdownExtension, withoutMarkdownExtension } from "./paths.js";
import type { PackageContext, ParsedNote, ResolvedLink, WikiLink } from "./types.js";

export async function loadPackageContext(root: string): Promise<PackageContext> {
  const manifest = await loadManifest(root);
  const files = await listMarkdownFiles(root, manifest.context.include, manifest.context.exclude);
  const notes = new Map<string, ParsedNote>();

  for (const path of files) {
    const content = await readFile(join(root, path), "utf8");
    const { frontmatter, body } = parseFrontmatter(content);
    const headings = extractHeadings(body);
    const title =
      typeof frontmatter.title === "string"
        ? frontmatter.title
        : headings.find((heading) => heading.depth === 1)?.text ?? withoutMarkdownExtension(path).split("/").pop() ?? path;
    notes.set(path, {
      path,
      title,
      frontmatter,
      headings,
      wikilinks: extractWikiLinks(body),
      content
    });
  }

  return { root, manifest, name: manifest.name, version: manifest.version, notes };
}

export async function resolveWikiLink(
  link: WikiLink,
  options: {
    fromPath: string;
    currentPackage: PackageContext;
    installedPackages: Map<string, PackageContext>;
  }
): Promise<ResolvedLink> {
  if (link.packageName) {
    return resolveCrossPackageLink(link, options);
  }
  return resolveLocalLink(link, options.fromPath, options.currentPackage);
}

function resolveCrossPackageLink(
  link: WikiLink,
  options: {
    fromPath: string;
    currentPackage: PackageContext;
    installedPackages: Map<string, PackageContext>;
  }
): ResolvedLink {
  const dependencyRange =
    options.currentPackage.manifest.knowledgeDependencies[link.packageName!] ??
    options.currentPackage.manifest.dependencies[link.packageName!];
  if (!dependencyRange) {
    return missing(link, options.fromPath, "package_not_declared");
  }

  const dependency = options.installedPackages.get(link.packageName!);
  if (!dependency) {
    return missing(link, options.fromPath, "package_not_installed");
  }

  const exported = resolveExportedPath(dependency, link.target);
  if (!exported) {
    return missing(link, options.fromPath, "export_not_found");
  }

  return validateHeading(link, options.fromPath, dependency, exported);
}

export function resolveExportedPath(pkg: PackageContext, target: string): string | undefined {
  const normalizedTarget = target === "." ? "." : `./${normalizePackagePath(target)}`;
  const direct = pkg.manifest.exports[normalizedTarget];
  if (direct) {
    return normalizePackagePath(direct);
  }

  for (const [key, value] of Object.entries(pkg.manifest.exports)) {
    if (!key.endsWith("/*") || !value.includes("*")) {
      continue;
    }
    const keyPrefix = key.slice(2, -1);
    const targetWithoutDot = normalizePackagePath(target);
    if (!targetWithoutDot.startsWith(keyPrefix)) {
      continue;
    }
    const wildcardValue = targetWithoutDot.slice(keyPrefix.length);
    return normalizePackagePath(value.replace("*", wildcardValue));
  }

  return undefined;
}

function resolveLocalLink(link: WikiLink, fromPath: string, pkg: PackageContext): ResolvedLink {
  const candidates = localCandidates(link.target, fromPath, pkg);
  if (candidates.length === 0) {
    return missing(link, fromPath, "missing local note");
  }
  if (candidates.length > 1 && pkg.manifest.wikilinks.ambiguous === "error") {
    return {
      raw: link.raw,
      from: fromPath,
      status: "ambiguous",
      reason: "ambiguous local note",
      candidates
    };
  }
  return validateHeading(link, fromPath, pkg, candidates[0]);
}

function localCandidates(target: string, fromPath: string, pkg: PackageContext): string[] {
  const normalized = normalizePackagePath(target);
  const targetPath = withMarkdownExtension(normalized);
  const near = normalizePackagePath(join(dirname(fromPath), targetPath));
  const root = normalizePackagePath(targetPath);
  const candidates = new Set<string>();

  if (pkg.notes.has(near)) {
    candidates.add(near);
  }
  if (pkg.notes.has(root)) {
    candidates.add(root);
  }

  const targetSlug = slugifyHeading(withoutMarkdownExtension(normalized).split("/").pop() ?? normalized);
  for (const note of pkg.notes.values()) {
    const basename = withoutMarkdownExtension(note.path).split("/").pop() ?? note.path;
    if (slugifyHeading(basename) === targetSlug || slugifyHeading(note.title) === targetSlug) {
      candidates.add(note.path);
    }
  }

  return [...candidates].sort();
}

function validateHeading(link: WikiLink, fromPath: string, pkg: PackageContext, toPath: string): ResolvedLink {
  const note = pkg.notes.get(toPath);
  if (!note) {
    return missing(link, fromPath, "target file not indexed");
  }
  if (link.heading) {
    const expected = slugifyHeading(link.heading);
    const matched = note.headings.find((heading) => heading.slug === expected);
    if (!matched) {
      return missing(link, fromPath, "heading_not_found");
    }
    return {
      raw: link.raw,
      from: fromPath,
      toPackage: pkg.name,
      toPath,
      toHeading: matched.text,
      status: "resolved"
    };
  }
  return {
    raw: link.raw,
    from: fromPath,
    toPackage: pkg.name,
    toPath,
    status: "resolved"
  };
}

function missing(link: WikiLink, fromPath: string, reason: string): ResolvedLink {
  return {
    raw: link.raw,
    from: fromPath,
    status: "missing",
    reason
  };
}
