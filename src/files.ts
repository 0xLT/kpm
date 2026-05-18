import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
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

export async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function walkFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function visit(absDir: string) {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && INTERNAL_DIRS.has(entry.name)) {
        continue;
      }
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
      } else if (entry.isFile()) {
        found.push(toPosixPath(relative(root, abs)));
      }
    }
  }

  await visit(root);
  return found.sort();
}

export async function listMarkdownFiles(
  root: string,
  include: string[] = ["**/*.md"],
  exclude: string[] = []
): Promise<string[]> {
  const files = (await walkFiles(root)).filter((path) => path.toLowerCase().endsWith(".md"));
  return files.filter((path) => matchesAny(path, include) && !matchesAny(path, exclude));
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

export function matchesPattern(path: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/^\.\/+/, "");
  if (normalizedPattern === "**/*.md") {
    return path.toLowerCase().endsWith(".md");
  }
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (!normalizedPattern.includes("*")) {
    return path === normalizedPattern;
  }
  const regex = new RegExp(
    `^${escapeRegex(normalizedPattern).replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*")}$`
  );
  return regex.test(path);
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    filter: (path) => !path.split("/").some((part) => INTERNAL_DIRS.has(part))
  });
}

export async function copyDirectoryClean(source: string, destination: string): Promise<void> {
  await copyDirectory(source, destination);
}

export async function ensureSymlink(target: string, linkPath: string): Promise<void> {
  await mkdir(dirname(linkPath), { recursive: true });
  await rm(linkPath, { recursive: true, force: true });
  await symlink(target, linkPath, "dir");
}

export async function hashDirectory(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of await walkFiles(root)) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(join(root, path)));
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
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
