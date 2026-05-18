import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { x as tarExtract } from "tar";
import { assertDirectory } from "../files.js";
import { isPathInside } from "../paths.js";
import type { LockfilePackage, LockfileRefType } from "../types.js";
import type { PackageSource } from "./sources.js";

const USER_AGENT = "kpm/2";

export type MaterializedSource = {
  rootPath: string;
  resolvedUrl: string;
  ref: string;
  refType: LockfileRefType;
  commit: string;
  tarballIntegrity: string;
};

export async function materializeSource(source: PackageSource): Promise<MaterializedSource> {
  if (source.kind === "file") {
    return materializeFileSource(source);
  }
  return materializeGithubSource(source);
}

export async function materializeFileSource(source: Extract<PackageSource, { kind: "file" }>): Promise<MaterializedSource> {
  const abs = resolve(source.path);
  await assertDirectory(abs);
  return {
    rootPath: abs,
    resolvedUrl: `file:${abs}`,
    ref: "",
    refType: "sha",
    commit: "",
    tarballIntegrity: ""
  };
}

export async function materializeGithubSource(
  source: Extract<PackageSource, { kind: "github" }>
): Promise<MaterializedSource> {
  const commit = await resolveGithubCommit(source);
  const resolvedUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/tarball/${commit}`;
  const bytes = await fetchBytes(resolvedUrl);
  const tarballIntegrity = hashBytes(bytes);
  await writeCachedTarball(tarballIntegrity, bytes);

  const work = await mkdtemp(join(tmpdir(), "kpm-gh-"));
  const archive = join(work, "package.tgz");
  await writeFile(archive, bytes);
  const dest = join(work, "extract");
  const rootPath = await extractTarball(archive, dest);

  return {
    rootPath,
    resolvedUrl,
    ref: source.ref,
    refType: source.refType,
    commit,
    tarballIntegrity
  };
}

export async function materializeLockfilePackage(pkg: LockfilePackage): Promise<MaterializedSource> {
  if (pkg.resolved.startsWith("file:")) {
    const abs = resolve(pkg.resolved.slice("file:".length));
    await assertDirectory(abs);
    return {
      rootPath: abs,
      resolvedUrl: pkg.resolved,
      ref: pkg.ref,
      refType: pkg.refType,
      commit: pkg.commit,
      tarballIntegrity: pkg.tarballIntegrity
    };
  }

  const bytes = await fetchBytes(pkg.resolved);
  const actual = hashBytes(bytes);
  if (pkg.tarballIntegrity && actual !== pkg.tarballIntegrity) {
    throw new Error(`lockfile tarball integrity mismatch for ${pkg.resolved}: expected ${pkg.tarballIntegrity}, got ${actual}`);
  }
  await writeCachedTarball(actual, bytes);

  const work = await mkdtemp(join(tmpdir(), "kpm-lock-"));
  const archive = join(work, "package.tgz");
  await writeFile(archive, bytes);
  const dest = join(work, "extract");
  const rootPath = await extractTarball(archive, dest);
  return {
    rootPath,
    resolvedUrl: pkg.resolved,
    ref: pkg.ref,
    refType: pkg.refType,
    commit: pkg.commit,
    tarballIntegrity: actual
  };
}

export type ExtractOptions = { mustStayInside?: string };

export async function extractTarball(archive: string, dest: string, options: ExtractOptions = {}): Promise<string> {
  const root = resolve(dest);
  await mkdir(root, { recursive: true });
  let unsafeEntry: Error | undefined;
  await tarExtract({
    file: archive,
    cwd: root,
    strict: true,
    filter: (entryPath) => {
      try {
        assertSafeTarEntry(root, entryPath, options.mustStayInside);
        return true;
      } catch (error) {
        unsafeEntry = error instanceof Error ? error : new Error(String(error));
        return false;
      }
    }
  });
  if (unsafeEntry) {
    throw unsafeEntry;
  }

  const entries = await readdir(root, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length !== 1) {
    throw new Error(`Expected tarball to contain one top-level directory, found ${dirs.length}`);
  }
  return join(root, dirs[0].name);
}

function assertSafeTarEntry(dest: string, entryPath: string, mustStayInside?: string): void {
  if (isAbsolute(entryPath) || entryPath.split(/[\\/]/).includes("..") || entryPath.includes("\0")) {
    throw new Error(`refusing tar entry with unsafe path: ${entryPath}`);
  }
  const target = resolve(dest, entryPath);
  const boundary = mustStayInside ? resolve(mustStayInside) : dest;
  if (!isPathInside(boundary, target)) {
    throw new Error(`refusing tar entry outside destination: ${entryPath}`);
  }
}

async function resolveGithubCommit(source: Extract<PackageSource, { kind: "github" }>): Promise<string> {
  if (source.refType === "sha" && source.ref.length === 40) {
    return source.ref;
  }

  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/commits/${source.ref}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/vnd.github+json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve ${source.original}: GitHub returned ${response.status}`);
  }
  const body = (await response.json()) as { sha?: unknown };
  if (typeof body.sha !== "string" || body.sha.length < 7) {
    throw new Error(`Failed to resolve ${source.original}: GitHub response did not include a commit sha`);
  }
  return body.sha;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function hashBytes(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}

async function writeCachedTarball(integrity: string, bytes: Buffer): Promise<void> {
  const safeName = integrity.replace(/^sha256-/, "").replace(/[^A-Za-z0-9._-]/g, "_");
  const path = join(homedir(), ".kpm", "cache", `${safeName}.tgz`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
