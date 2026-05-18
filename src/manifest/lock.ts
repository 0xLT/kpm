import { join } from "node:path";
import { fileExists, readJsonFile, writeJsonFile } from "../files.js";
import type { Lockfile, LockfileOverriddenSpec, LockfilePackage } from "../types.js";

export async function readLockfile(projectRoot: string): Promise<Lockfile> {
  const path = join(projectRoot, "knowledge.lock");
  if (!(await fileExists(path))) {
    return { lockfileVersion: 2, root: { name: "", version: "" }, packages: {} };
  }

  const raw = (await readJsonFile(path)) as Record<string, unknown>;
  if (raw.lockfileVersion !== 2) {
    throw new Error(
      `knowledge.lock has lockfileVersion=${raw.lockfileVersion}; v2 expects 2. Delete the lockfile and run kpm install.`
    );
  }

  return {
    lockfileVersion: 2,
    root: normalizeRoot(raw.root),
    packages: normalizePackages(raw.packages)
  };
}

export async function writeLockfile(projectRoot: string, lock: Lockfile): Promise<void> {
  await writeJsonFile(join(projectRoot, "knowledge.lock"), lock);
}

function normalizeRoot(value: unknown): Lockfile["root"] {
  if (typeof value !== "object" || value === null) {
    return { name: "", version: "" };
  }
  const root = value as Record<string, unknown>;
  return {
    name: typeof root.name === "string" ? root.name : "",
    version: typeof root.version === "string" ? root.version : ""
  };
}

function normalizePackages(value: unknown): Record<string, LockfilePackage> {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const out: Record<string, LockfilePackage> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }

    const pkg = raw as Record<string, unknown>;
    const refType = pkg.refType === "tag" || pkg.refType === "branch" || pkg.refType === "sha" ? pkg.refType : "sha";
    const overriddenSpecs = normalizeOverriddenSpecs(pkg.overriddenSpecs);
    out[name] = {
      version: typeof pkg.version === "string" ? pkg.version : "",
      spec: typeof pkg.spec === "string" ? pkg.spec : "",
      resolved: typeof pkg.resolved === "string" ? pkg.resolved : "",
      ref: typeof pkg.ref === "string" ? pkg.ref : "",
      refType,
      commit: typeof pkg.commit === "string" ? pkg.commit : "",
      integrity: typeof pkg.integrity === "string" ? pkg.integrity : "",
      tarballIntegrity: typeof pkg.tarballIntegrity === "string" ? pkg.tarballIntegrity : "",
      dependencies: stringRecord(pkg.dependencies),
      requestedBy: Array.isArray(pkg.requestedBy)
        ? pkg.requestedBy.filter((entry): entry is string => typeof entry === "string")
        : [],
      ...(overriddenSpecs.length > 0 ? { overriddenSpecs } : {})
    };
  }
  return out;
}

function normalizeOverriddenSpecs(value: unknown): LockfileOverriddenSpec[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: LockfileOverriddenSpec[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const spec = entry as Record<string, unknown>;
    if (typeof spec.spec === "string" && typeof spec.requestedBy === "string") {
      out.push({ spec: spec.spec, requestedBy: spec.requestedBy });
    }
  }
  return out;
}

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
