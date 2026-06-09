import { resolve as resolvePath } from "node:path";
import { readKnowledgeManifest } from "../manifest/knowledge.js";
import type { KnowledgeManifest, LockfileRefType } from "../types.js";
import { materializeSource } from "./fetch.js";
import { parsePackageSource, type PackageSource } from "./sources.js";
import { reconcileSingletons, type DependencyRequest, type Singleton } from "./singleton.js";

export type ResolvedPackage = {
  singleton: Singleton;
  source: PackageSource;
  rootPath: string;
  resolvedUrl: string;
  ref: string;
  refType: LockfileRefType;
  commit: string;
  tarballIntegrity: string;
  manifest: KnowledgeManifest;
};

export type InstallPlan = {
  singletons: Map<string, ResolvedPackage>;
};

export type DependencySourceOverride = (request: DependencyRequest) => string;

type MaterializedPackage = Omit<ResolvedPackage, "singleton">;

export async function buildInstallPlan(
  initial: DependencyRequest[],
  options: { overrideDependencySource?: DependencySourceOverride } = {}
): Promise<InstallPlan> {
  const queue: DependencyRequest[] = [...initial];
  const allRequests: DependencyRequest[] = [];
  const seenRequests = new Set<string>();
  const materializedBySpec = new Map<string, MaterializedPackage>();

  while (queue.length > 0) {
    const request = queue.shift()!;
    const requestKey = `${request.name}::${request.source}::${request.requestedBy}`;
    if (!seenRequests.has(requestKey)) {
      seenRequests.add(requestKey);
      allRequests.push(request);
    }

    const sourceKey = `${request.name}::${request.source}`;
    if (materializedBySpec.has(sourceKey)) {
      continue;
    }

    const source = parsePackageSource(request.source);
    const materialized = await materializeSource(source);
    const manifest = await readKnowledgeManifest(materialized.rootPath);
    materializedBySpec.set(sourceKey, {
      source,
      rootPath: materialized.rootPath,
      resolvedUrl: materialized.resolvedUrl,
      ref: materialized.ref,
      refType: materialized.refType,
      commit: materialized.commit,
      tarballIntegrity: materialized.tarballIntegrity,
      manifest
    });

    for (const [depName, depSpec] of Object.entries(manifest.knowledgeDependencies)) {
      const dependencyRequest = {
        name: depName,
        source: normalizeFileSpec(depSpec, source),
        requestedBy: manifest.name
      };
      queue.push({
        ...dependencyRequest,
        source: options.overrideDependencySource?.(dependencyRequest) ?? dependencyRequest.source
      });
    }
  }

  const singletons = reconcileSingletons(allRequests);
  const resolved = new Map<string, ResolvedPackage>();
  for (const singleton of singletons.values()) {
    const materialized = materializedBySpec.get(`${singleton.name}::${singleton.source}`);
    if (!materialized) {
      throw new Error(
        `internal resolver error: ${singleton.name} resolved to ${singleton.source} but was not materialized`
      );
    }
    resolved.set(singleton.name, { singleton, ...materialized });
  }
  return { singletons: resolved };
}

function normalizeFileSpec(spec: string, parent: PackageSource): string {
  if (!spec.startsWith("file:")) {
    return spec;
  }
  const rest = spec.slice("file:".length);
  if (rest.startsWith("/")) {
    return spec;
  }
  if (parent.kind !== "file") {
    throw new Error(`relative file: dependency "${spec}" is only allowed from a file: parent`);
  }
  return `file:${resolvePath(parent.path, rest)}`;
}
