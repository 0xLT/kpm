import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import semver from "semver";
import { x as tarExtract } from "tar";
import { assertDirectory } from "../files.js";
import { isPathInside } from "../paths.js";
import type { LockfilePackage, LockfileRefType } from "../types.js";
import type { PackageSource } from "./sources.js";

const USER_AGENT = "kpm/2";

function githubAuthToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return token && token.trim() !== "" ? token.trim() : undefined;
}

function githubHeaders(accept?: string): Record<string, string> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT };
  if (accept) {
    headers.accept = accept;
  }
  const token = githubAuthToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

function tarballHeaders(url: string): Record<string, string> {
  return shouldAuthenticateTarballUrl(url) ? githubHeaders() : { "user-agent": USER_AGENT };
}

function shouldAuthenticateTarballUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  if (url.hostname === "api.github.com") {
    return /^\/repos\/[^/]+\/[^/]+\/tarball\/[^/]+/.test(url.pathname);
  }
  if (url.hostname === "codeload.github.com") {
    return /^\/[^/]+\/[^/]+\/tar\.(?:gz|zip)\/[^/]+/.test(url.pathname);
  }
  if (url.hostname === "github.com") {
    return /^\/[^/]+\/[^/]+\/archive\//.test(url.pathname);
  }
  return false;
}

export type GitHubTag = {
  name: string;
};

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
  let ref = source.ref;
  let refType: LockfileRefType = source.refType === "semver" ? "tag" : source.refType;
  if (source.refType === "semver") {
    const tags = await listGithubTags(source.owner, source.repo);
    ref = resolveHighestMatchingSemverTag(tags, source.ref, source.original);
    refType = "tag";
  }

  const commit =
    source.refType === "sha" && source.ref.length === 40
      ? source.ref
      : await resolveGithubCommit(source.owner, source.repo, ref, source.original);
  const resolvedUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/tarball/${commit}`;
  const bytes = await fetchTarballBytes(resolvedUrl);
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
    ref,
    refType,
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

  const bytes = await fetchTarballBytes(pkg.resolved);
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

export async function listGithubTags(
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch
): Promise<GitHubTag[]> {
  let url: string | undefined = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`;
  const tags: GitHubTag[] = [];

  while (url) {
    const response = await fetchImpl(url, {
      headers: githubHeaders("application/vnd.github+json")
    });
    if (!response.ok) {
      throw new Error(`Failed to list GitHub tags for ${owner}/${repo}: GitHub returned ${response.status}`);
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error(`Failed to list GitHub tags for ${owner}/${repo}: GitHub response was not an array`);
    }
    for (const entry of body) {
      if (typeof entry === "object" && entry !== null && typeof (entry as { name?: unknown }).name === "string") {
        tags.push({ name: (entry as { name: string }).name });
      }
    }
    url = nextLink(response.headers.get("link"));
  }

  return tags;
}

export function resolveHighestMatchingSemverTag(tags: GitHubTag[], range: string, sourceLabel: string): string {
  const candidates: { tag: string; version: string }[] = [];
  for (const tag of tags) {
    const version = semver.valid(tag.name.replace(/^v/, ""));
    if (version) {
      candidates.push({ tag: tag.name, version });
    }
  }

  let match: string | null;
  try {
    match = semver.maxSatisfying(
      candidates.map((candidate) => candidate.version),
      range
    );
  } catch (error) {
    throw new Error(
      `Invalid semver range "${range}" for ${sourceLabel}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!match) {
    throw new Error(`No GitHub tag satisfies semver range "${range}" for ${sourceLabel}`);
  }

  return candidates.find((candidate) => candidate.version === match)!.tag;
}

export async function resolveGithubCommit(
  owner: string,
  repo: string,
  ref: string,
  sourceLabel: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`;
  const response = await fetchImpl(url, {
    headers: githubHeaders("application/vnd.github+json")
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve ${sourceLabel}: GitHub returned ${response.status}`);
  }
  const body = (await response.json()) as { sha?: unknown };
  if (typeof body.sha !== "string" || body.sha.length < 7) {
    throw new Error(`Failed to resolve ${sourceLabel}: GitHub response did not include a commit sha`);
  }
  return body.sha;
}

export async function fetchTarballBytes(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const response = await fetchImpl(url, { headers: tarballHeaders(url) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function nextLink(linkHeader: string | null): string | undefined {
  if (!linkHeader) {
    return undefined;
  }
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
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
