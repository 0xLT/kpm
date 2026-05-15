import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertDirectory, copyDirectory, ensureSymlink, fileExists, hashDirectory, readJsonFile, writeJsonFile } from "./files.js";
import { loadManifest, normalizeManifest, validateManifest } from "./manifest.js";
import { loadPackageContext } from "./resolver.js";
import { parsePackageSource, type PackageSource } from "./sources.js";
import type { KnowledgeManifest } from "./types.js";

const execFileAsync = promisify(execFile);

export type InstallResult = {
  manifest: KnowledgeManifest;
  integrity: string;
  source: PackageSource;
  storePath: string;
};

export async function installPackage(projectRoot: string, sourceSpec: string): Promise<InstallResult> {
  const source = parsePackageSource(sourceSpec);
  const sourceRoot = await materializeSource(source);
  const manifest = await loadManifest(sourceRoot);
  const context = await loadPackageContext(sourceRoot);
  const totalLinks = [...context.notes.values()].reduce((count, note) => count + note.wikilinks.length, 0);
  if (context.manifest.context.requireWikilinks && totalLinks === 0) {
    throw new Error(`${manifest.name} has no wikilinks; set context.requireWikilinks=false to opt out`);
  }

  const integrity = await hashDirectory(sourceRoot);
  const storePath = join(projectRoot, ".kpm", "store", integrity);
  await copyDirectory(sourceRoot, storePath);

  const packageLink = join(projectRoot, ".kpm", "packages", ...manifest.name.split("/"));
  const moduleLink = join(projectRoot, "knowledge_modules", ...manifest.name.split("/"));
  await ensureSymlink(storePath, packageLink);
  await ensureSymlink(packageLink, moduleLink);

  await updateProjectManifest(projectRoot, manifest.name, source.original);
  await updateLockfile(projectRoot, manifest, source, integrity);

  return { manifest, integrity, source, storePath };
}

async function materializeSource(source: PackageSource): Promise<string> {
  if (source.kind === "file") {
    const abs = resolve(source.path);
    await assertDirectory(abs);
    return abs;
  }

  const work = await mkdtemp(join(tmpdir(), "kpm-github-"));
  const archive = join(work, "package.tgz");
  const response = await fetch(source.tarballUrl, {
    headers: {
      "User-Agent": "kpm-mvp"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub tarball download failed: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(archive, bytes);
  const extractRoot = join(work, `extract-${hash}`);
  await mkdir(extractRoot, { recursive: true });
  await execFileAsync("tar", ["-xzf", archive, "-C", extractRoot]);
  const entries = await readdir(extractRoot);
  if (entries.length !== 1) {
    throw new Error("GitHub tarball did not contain exactly one top-level directory");
  }
  return join(extractRoot, entries[0]);
}

async function updateProjectManifest(projectRoot: string, packageName: string, sourceSpec: string): Promise<void> {
  const manifestPath = join(projectRoot, "knowledge.json");
  const raw = (await fileExists(manifestPath)) ? await readJsonFile(manifestPath) : undefined;
  const existing =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? normalizeManifest(raw as Record<string, unknown>)
      : normalizeManifest({
          name: basename(projectRoot).toLowerCase().replace(/[^a-z0-9._-]/g, "-") || "knowledge-project",
          version: "0.1.0",
          type: "knowledge-package",
          exports: { ".": "./README.md" },
          context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
        });

  const next: KnowledgeManifest = {
    ...existing,
    knowledgeDependencies: {
      ...existing.knowledgeDependencies,
      [packageName]: sourceSpec
    }
  };
  const validation = await validateManifest(next, (await fileExists(manifestPath)) ? { packageRoot: projectRoot } : {});
  if (!validation.ok) {
    throw new Error(`Cannot update project knowledge.json:\n${validation.errors.join("\n")}`);
  }
  await writeJsonFile(manifestPath, stripDefaultNoise(next));
}

async function updateLockfile(
  projectRoot: string,
  manifest: KnowledgeManifest,
  source: PackageSource,
  integrity: string
): Promise<void> {
  const lockPath = join(projectRoot, "knowledge.lock");
  const existing = (await fileExists(lockPath)) ? await readJsonFile(lockPath) : {};
  const lock =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const packages =
    typeof lock.packages === "object" && lock.packages !== null && !Array.isArray(lock.packages)
      ? (lock.packages as Record<string, unknown>)
      : {};

  packages[manifest.name] = {
    version: manifest.version,
    source: source.original,
    resolved: source.kind === "github" ? source.tarballUrl : source.path,
    integrity
  };
  await writeJsonFile(lockPath, {
    lockfileVersion: 1,
    packages
  });
}

function stripDefaultNoise(manifest: KnowledgeManifest): Record<string, unknown> {
  return {
    name: manifest.name,
    version: manifest.version,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.license ? { license: manifest.license } : {}),
    type: manifest.type,
    exports: manifest.exports,
    context: manifest.context,
    ...(Object.keys(manifest.dependencies).length ? { dependencies: manifest.dependencies } : {}),
    ...(Object.keys(manifest.knowledgeDependencies).length
      ? { knowledgeDependencies: manifest.knowledgeDependencies }
      : {}),
    wikilinks: manifest.wikilinks
  };
}

export async function removePackage(projectRoot: string, packageName: string): Promise<void> {
  await rm(join(projectRoot, "knowledge_modules", ...packageName.split("/")), { recursive: true, force: true });
  await rm(join(projectRoot, ".kpm", "packages", ...packageName.split("/")), { recursive: true, force: true });

  const manifestPath = join(projectRoot, "knowledge.json");
  if (await fileExists(manifestPath)) {
    const manifest = normalizeManifest((await readJsonFile(manifestPath)) as Record<string, unknown>);
    delete manifest.knowledgeDependencies[packageName];
    await writeJsonFile(manifestPath, stripDefaultNoise(manifest));
  }

  const lockPath = join(projectRoot, "knowledge.lock");
  if (await fileExists(lockPath)) {
    const lock = (await readJsonFile(lockPath)) as { packages?: Record<string, unknown> };
    delete lock.packages?.[packageName];
    await writeJsonFile(lockPath, lock);
  }
}
