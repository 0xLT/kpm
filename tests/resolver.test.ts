import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { loadPackageContext, resolveWikiLink } from "../src/resolver.js";
import { parseWikiLink } from "../src/markdown.js";

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2));
}

describe("resolver", () => {
  test("resolves local notes near the current file and validates headings", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-resolve-local-"));
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "README.md"), "# Readme\nSee [[notes/components#Props]].\n");
    await writeFile(join(root, "notes", "components.md"), "# Components\n## Props\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/local",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md", "./components": "./notes/components.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const context = await loadPackageContext(root);
    const resolved = await resolveWikiLink(parseWikiLink("[[notes/components#Props]]"), {
      fromPath: "README.md",
      currentPackage: context,
      installedPackages: new Map()
    });

    expect(resolved.status).toBe("resolved");
    expect(resolved.toPath).toBe("notes/components.md");
    expect(resolved.toHeading).toBe("Props");
  });

  test("resolves cross-package links through exports only", async () => {
    const depRoot = await mkdtemp(join(tmpdir(), "kpm-resolve-dep-"));
    await writeFile(join(depRoot, "README.md"), "# Dep\nSee [[queries]].\n");
    await writeFile(join(depRoot, "queries.md"), "# Queries\n## Indexing\n");
    await writeFile(join(depRoot, "private.md"), "# Private\n");
    await writeJson(join(depRoot, "knowledge.json"), {
      name: "@acme/sql-guide",
      version: "0.2.0",
      type: "knowledge-package",
      exports: { ".": "./README.md", "./queries": "./queries.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });
    const depContext = await loadPackageContext(depRoot);

    const root = await mkdtemp(join(tmpdir(), "kpm-resolve-app-"));
    await writeFile(join(root, "README.md"), "# App\nSee [[@acme/sql-guide/queries#Indexing]].\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/app",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true },
      knowledgeDependencies: { "@acme/sql-guide": "github:acme/sql-guide-context#main" }
    });
    const appContext = await loadPackageContext(root);
    const installed = new Map([["@acme/sql-guide", depContext]]);

    const ok = await resolveWikiLink(parseWikiLink("[[@acme/sql-guide/queries#Indexing]]"), {
      fromPath: "README.md",
      currentPackage: appContext,
      installedPackages: installed
    });
    const blocked = await resolveWikiLink(parseWikiLink("[[@acme/sql-guide/private]]"), {
      fromPath: "README.md",
      currentPackage: appContext,
      installedPackages: installed
    });

    expect(ok.status).toBe("resolved");
    expect(ok.toPackage).toBe("@acme/sql-guide");
    expect(ok.toPath).toBe("queries.md");
    expect(blocked.status).toBe("missing");
    expect(blocked.reason).toBe("export_not_found");
  });
});
