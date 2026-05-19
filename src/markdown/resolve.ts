import { basename, posix } from "node:path";
import { toPosixPath, withMarkdownExtension, withoutMarkdownExtension } from "../paths.js";
import type { WikiLink } from "../types.js";

export type LinkablePackage = {
  name: string;
  files: Set<string>;
  noteSlugs: Map<string, string[]>;
};

export type WikiLinkResolution =
  | { ok: true; target: string }
  | { ok: false; message: string };

export function createLinkablePackage(name: string, files: Iterable<string>): LinkablePackage {
  const fileSet = new Set(files);
  const noteSlugs = new Map<string, string[]>();
  for (const file of fileSet) {
    if (!file.toLowerCase().endsWith(".md")) {
      continue;
    }
    const slug = basename(withoutMarkdownExtension(file)).toLowerCase();
    noteSlugs.set(slug, [...(noteSlugs.get(slug) ?? []), file]);
  }
  return { name, files: fileSet, noteSlugs };
}

export function resolveWikiLink(
  current: LinkablePackage,
  fromFile: string,
  link: WikiLink,
  packages: Map<string, LinkablePackage>
): WikiLinkResolution {
  if (link.packageName) {
    return resolvePackageLink(current, fromFile, link, packages);
  }

  if (link.target.startsWith("./") || link.target.startsWith("../")) {
    const resolved = posix.normalize(posix.join(posix.dirname(toPosixPath(fromFile)), link.target));
    return resolveKnownLocalPath(current, fromFile, link, resolved);
  }

  if (link.target.includes("/")) {
    return resolveKnownLocalPath(current, fromFile, link, link.target);
  }

  const matches = current.noteSlugs.get(link.target.toLowerCase()) ?? [];
  if (matches.length === 0) {
    return {
      ok: false,
      message: `${current.name}/${fromFile}: ${link.raw} -> no file matches "${link.target}" inside ${current.name}`
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: `${current.name}/${fromFile}: ${link.raw} -> ambiguous, matches: ${matches.join(", ")}`
    };
  }
  return { ok: true, target: `${current.name}/${withoutMarkdownExtension(matches[0])}` };
}

function resolvePackageLink(
  current: LinkablePackage,
  fromFile: string,
  link: WikiLink,
  packages: Map<string, LinkablePackage>
): WikiLinkResolution {
  const targetPkg = packages.get(link.packageName!);
  if (!targetPkg) {
    return {
      ok: false,
      message: `${current.name}/${fromFile}: ${link.raw} -> package ${link.packageName} not installed`
    };
  }
  const target = withMarkdownExtension(link.target);
  if (!targetPkg.files.has(target)) {
    return {
      ok: false,
      message: `${current.name}/${fromFile}: ${link.raw} -> ${link.packageName} has no file ${target}`
    };
  }
  return { ok: true, target: `${targetPkg.name}/${withoutMarkdownExtension(target)}` };
}

function resolveKnownLocalPath(
  current: LinkablePackage,
  fromFile: string,
  link: WikiLink,
  targetPath: string
): WikiLinkResolution {
  const target = withMarkdownExtension(targetPath);
  if (!current.files.has(target)) {
    return {
      ok: false,
      message: `${current.name}/${fromFile}: ${link.raw} -> no file at ${target}`
    };
  }
  return { ok: true, target: `${current.name}/${withoutMarkdownExtension(target)}` };
}
