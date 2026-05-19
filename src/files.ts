import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { access, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import picomatch from "picomatch";
import { toPosixPath } from "./paths.js";

const INTERNAL_DIRS = new Set([".git", ".kpm", "knowledge_modules", "node_modules", "dist"]);

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export type WalkFilesOptions = {
  prune?: string[];
};

export async function walkFiles(root: string, options: WalkFilesOptions = {}): Promise<string[]> {
  const found: string[] = [];
  const shouldPrune = options.prune?.length ? picomatch(options.prune, { dot: true }) : undefined;

  async function visit(absDir: string) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      const path = toPosixPath(relative(root, abs));
      if (entry.isDirectory() && (INTERNAL_DIRS.has(entry.name) || shouldPrune?.(path))) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(abs);
      } else if (entry.isFile()) {
        found.push(path);
      }
    }
  }

  await visit(root);
  return found.sort();
}

export type ListPackageFilesOptions = {
  excludes?: string[];
};

const DEFAULT_PACKAGE_EXCLUDES = ["knowledge_modules/**", ".kpm/**", "node_modules/**"];

export async function listPackageFiles(
  root: string,
  patterns: string[],
  options: ListPackageFilesOptions = {}
): Promise<string[]> {
  const includes = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excludes = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
  const allExcludes = [...DEFAULT_PACKAGE_EXCLUDES, ...excludes, ...(options.excludes ?? [])];
  const isIncluded = picomatch(includes.length > 0 ? includes : ["**/*.md"], { dot: false });
  const isExcluded = picomatch(allExcludes, { dot: true });
  return (await walkFiles(root, { prune: allExcludes })).filter((path) => isIncluded(path) && !isExcluded(path)).sort();
}

export async function listInstalledPackageRoots(projectRoot: string): Promise<string[]> {
  const modulesRoot = join(projectRoot, "knowledge_modules");
  if (!(await fileExists(modulesRoot))) {
    return [];
  }

  const packageRoots: string[] = [];
  for (const entry of await readdir(modulesRoot, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && isDirectoryLike(entry)) {
      for (const scoped of await readdir(join(modulesRoot, entry.name), { withFileTypes: true })) {
        if (isDirectoryLike(scoped)) {
          packageRoots.push(join(modulesRoot, entry.name, scoped.name));
        }
      }
    } else if (isDirectoryLike(entry)) {
      packageRoots.push(join(modulesRoot, entry.name));
    }
  }
  return packageRoots.sort();
}

function isDirectoryLike(entry: Dirent): boolean {
  return entry.isDirectory() || entry.isSymbolicLink();
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (path) => !path.split("/").some((part) => INTERNAL_DIRS.has(part))
  });
}

export async function canonicalContentHash(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of await walkFiles(root)) {
    const content = await readFile(join(root, path), "utf8");
    hash.update(path);
    hash.update("\0");
    hash.update(content.replace(/\r\n/g, "\n"));
    hash.update("\0");
  }
  return `sha256-${hash.digest("base64")}`;
}

export async function assertDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory()) {
    throw new Error(`${path} is not a directory`);
  }
}
