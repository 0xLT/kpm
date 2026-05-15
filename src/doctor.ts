import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileExists } from "./files.js";
import { loadPackageContext, resolveWikiLink } from "./resolver.js";
import type { Graph, LinkEdge, PackageContext } from "./types.js";

export type DoctorReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  graph: Graph;
};

export async function runDoctor(projectRoot: string): Promise<DoctorReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const graph: Graph = { nodes: [], edges: [] };

  let currentPackage: PackageContext;
  try {
    currentPackage = await loadPackageContext(projectRoot);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
      graph
    };
  }

  const installedPackages = await loadInstalledPackageContexts(projectRoot, warnings);
  await inspectPackage(currentPackage, installedPackages, errors, graph);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    graph
  };
}

export async function loadInstalledPackageContexts(
  projectRoot: string,
  warnings: string[] = []
): Promise<Map<string, PackageContext>> {
  const modulesRoot = join(projectRoot, "knowledge_modules");
  const installed = new Map<string, PackageContext>();
  if (!(await fileExists(modulesRoot))) {
    return installed;
  }

  for (const entry of await readdir(modulesRoot, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopeRoot = join(modulesRoot, entry.name);
      for (const scoped of await readdir(scopeRoot, { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          await tryLoad(join(scopeRoot, scoped.name), installed, warnings);
        }
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      await tryLoad(join(modulesRoot, entry.name), installed, warnings);
    }
  }
  return installed;
}

async function tryLoad(root: string, installed: Map<string, PackageContext>, warnings: string[]) {
  try {
    const context = await loadPackageContext(root);
    installed.set(context.name, context);
  } catch (error) {
    warnings.push(`could not load installed package at ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function inspectPackage(
  pkg: PackageContext,
  installedPackages: Map<string, PackageContext>,
  errors: string[],
  graph: Graph
): Promise<void> {
  let linkCount = 0;
  for (const note of pkg.notes.values()) {
    graph.nodes.push({
      id: `${pkg.name}/${note.path}`,
      packageName: pkg.name,
      path: note.path
    });
    linkCount += note.wikilinks.length;
    if (
      pkg.manifest.context.requireWikilinks &&
      note.wikilinks.length === 0 &&
      note.frontmatter.kpmAllowNoWikilinks !== true
    ) {
      errors.push(`${note.path}: file has no wikilinks; add [[...]] or set kpmAllowNoWikilinks: true in frontmatter`);
    }
    for (const link of note.wikilinks) {
      const resolved = await resolveWikiLink(link, {
        fromPath: note.path,
        currentPackage: pkg,
        installedPackages
      });
      const edge: LinkEdge = {
        from: `${pkg.name}/${note.path}`,
        to: resolved.toPackage && resolved.toPath ? `${resolved.toPackage}/${resolved.toPath}` : undefined,
        raw: resolved.raw,
        packageName: pkg.name,
        resolved: resolved.status === "resolved",
        status: resolved.status,
        reason: resolved.reason
      };
      graph.edges.push(edge);
      if (resolved.status !== "resolved") {
        errors.push(`${note.path}: ${link.raw} -> ${formatReason(resolved.reason ?? resolved.status)}`);
      }
    }
  }

  if (pkg.manifest.context.requireWikilinks && linkCount === 0) {
    errors.push("package has no wikilinks; set context.requireWikilinks=false to opt out");
  }
}

function formatReason(reason: string): string {
  switch (reason) {
    case "package_not_declared":
      return "package not declared in knowledgeDependencies";
    case "package_not_installed":
      return "package not installed";
    case "export_not_found":
      return "export not found";
    case "heading_not_found":
      return "heading not found";
    default:
      return reason;
  }
}
