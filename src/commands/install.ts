import { rm } from "node:fs/promises";
import { join } from "node:path";
import { canonicalContentHash, copyDirectory, writeJsonFile } from "../files.js";
import { readKnowledgeManifest, readProjectManifest } from "../manifest/knowledge.js";
import { readLockfile, writeLockfile } from "../manifest/lock.js";
import { materializeLockfilePackage, materializeSource } from "../resolver/fetch.js";
import { buildInstallPlan } from "../resolver/plan.js";
import { parsePackageSource } from "../resolver/sources.js";
import { warnMutableRef } from "../resolver/warnings.js";
import type { KnowledgeManifest, Lockfile, LockfilePackage } from "../types.js";

export async function installNew(projectRoot: string, sourceSpec: string): Promise<void> {
  const rootManifest = await readProjectManifest(projectRoot);
  const source = parsePackageSource(sourceSpec);
  warnMutableRef(source, "kpm add");
  const probe = await materializeSource(source);
  const probeManifest = await readKnowledgeManifest(probe.rootPath);

  rootManifest.knowledgeDependencies = {
    ...rootManifest.knowledgeDependencies,
    [probeManifest.name]: sourceSpec
  };
  await writeJsonFile(join(projectRoot, "knowledge.json"), stripDefaults(rootManifest));
  await reinstall(projectRoot, rootManifest);
}

export async function installFromLockfile(projectRoot: string): Promise<void> {
  const lock = await readLockfile(projectRoot);
  if (Object.keys(lock.packages).length === 0) {
    const rootManifest = await readProjectManifest(projectRoot);
    if (Object.keys(rootManifest.knowledgeDependencies).length > 0) {
      throw new Error("knowledge.lock has no packages; run `kpm add <source>` or regenerate the lockfile intentionally.");
    }
    return;
  }
  await hydrateFromLockfile(projectRoot, lock);
}

async function reinstall(projectRoot: string, rootManifest: KnowledgeManifest): Promise<void> {
  const initial = Object.entries(rootManifest.knowledgeDependencies).map(([name, source]) => ({
    name,
    source,
    requestedBy: "root"
  }));
  const plan = await buildInstallPlan(initial);
  const lock: Lockfile = {
    lockfileVersion: 2,
    root: { name: rootManifest.name, version: rootManifest.version },
    packages: {}
  };

  const modulesRoot = join(projectRoot, "knowledge_modules");
  await rm(modulesRoot, { recursive: true, force: true });

  for (const [name, resolved] of plan.singletons) {
    const tagVersion = resolved.refType === "tag" ? inferTagVersion(resolved.ref) : null;
    if (tagVersion && resolved.manifest.version !== tagVersion) {
      throw new Error(`${name}: ref ${resolved.ref} does not match manifest version ${resolved.manifest.version}`);
    }
    warnMutableRef(resolved.source, "kpm install", name);

    const modulePath = join(modulesRoot, ...name.split("/"));
    await copyDirectory(resolved.rootPath, modulePath);
    const integrity = await canonicalContentHash(modulePath);
    const entry: LockfilePackage = {
      version: resolved.manifest.version,
      spec: resolved.singleton.source,
      resolved: resolved.resolvedUrl,
      ref: resolved.ref,
      refType: resolved.refType,
      commit: resolved.commit,
      integrity,
      tarballIntegrity: resolved.tarballIntegrity,
      dependencies: Object.fromEntries(
        Object.entries(resolved.manifest.knowledgeDependencies).map(([depName]) => {
          const dep = plan.singletons.get(depName);
          return [depName, dep ? dep.manifest.version : ""];
        })
      ),
      requestedBy: resolved.singleton.requestedBy,
      ...(resolved.singleton.overriddenSpecs.length > 0 ? { overriddenSpecs: resolved.singleton.overriddenSpecs } : {})
    };
    lock.packages[name] = entry;
  }

  await writeLockfile(projectRoot, lock);
}

async function hydrateFromLockfile(projectRoot: string, lock: Lockfile): Promise<void> {
  const modulesRoot = join(projectRoot, "knowledge_modules");
  await rm(modulesRoot, { recursive: true, force: true });

  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (pkg.refType === "branch") {
      console.warn(`warning: kpm install using mutable ref ${name}#${pkg.ref} pinned to ${pkg.commit}`);
    }
    const materialized = await materializeLockfilePackage(pkg);
    const modulePath = join(modulesRoot, ...name.split("/"));
    await copyDirectory(materialized.rootPath, modulePath);
    const integrity = await canonicalContentHash(modulePath);
    if (pkg.integrity && integrity !== pkg.integrity) {
      throw new Error(`${name}: lockfile integrity mismatch. Expected ${pkg.integrity}, got ${integrity}`);
    }
  }
}

function inferTagVersion(ref: string): string | null {
  return /^v?\d+\.\d+\.\d+/.test(ref) ? ref.replace(/^v/, "").split(/[-+]/)[0] : null;
}

function stripDefaults(manifest: KnowledgeManifest): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type
  };
  if (manifest.description) out.description = manifest.description;
  if (manifest.license) out.license = manifest.license;
  if (manifest.files.length !== 1 || manifest.files[0] !== "**/*.md") out.files = manifest.files;
  if (manifest.entrypoint !== "README.md") out.entrypoint = manifest.entrypoint;
  if (Object.keys(manifest.knowledgeDependencies).length > 0) {
    out.knowledgeDependencies = manifest.knowledgeDependencies;
  }
  return out;
}
