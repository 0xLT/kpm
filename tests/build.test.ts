import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { buildContext } from "../src/compiler.js";

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2));
}

describe("compiler", () => {
  test("traverses wikilinks and writes context, graph, and citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-build-"));
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "README.md"), "# Root\nSee [[notes/architecture]].\n");
    await writeFile(join(root, "notes", "architecture.md"), "# Architecture\nSee [[README]].\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/project",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md", "./architecture": "./notes/architecture.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const result = await buildContext(root, {
      entries: ["README.md"],
      depth: 2,
      maxTokens: 1000,
      outDir: "dist"
    });

    expect(result.files.map((file) => file.path)).toEqual(["README.md", "notes/architecture.md"]);
    const output = await readFile(join(root, "dist", "context.md"), "utf8");
    expect(output).toContain("<!-- source: @scope/project/README.md -->");
    expect(output).toContain("<!-- source: @scope/project/notes/architecture.md -->");
    expect(await readFile(join(root, "dist", "graph.json"), "utf8")).toContain("notes/architecture.md");
    expect(await readFile(join(root, "dist", "citations.json"), "utf8")).toContain("@scope/project/README.md");
  });

  test("respects a token budget with deterministic entry ordering", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-build-budget-"));
    await writeFile(join(root, "README.md"), "# Root\nSee [[large]].\n");
    await writeFile(join(root, "large.md"), `# Large\nSee [[README]].\n${"word ".repeat(400)}`);
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/budget",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md", "./large": "./large.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const result = await buildContext(root, {
      entries: ["README.md"],
      depth: 2,
      maxTokens: 20,
      outDir: "dist"
    });

    expect(result.files.map((file) => file.path)).toEqual(["README.md"]);
    expect(result.skipped.map((file) => file.path)).toEqual(["large.md"]);
  });
});
