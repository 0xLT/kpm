import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { runDoctor } from "../src/doctor.js";

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2));
}

describe("doctor", () => {
  test("requires package markdown to contain wikilinks by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-doctor-no-links-"));
    await writeFile(join(root, "README.md"), "# No links here\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/no-links",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"] }
    });

    const report = await runDoctor(root);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("package has no wikilinks; set context.requireWikilinks=false to opt out");
  });

  test("reports broken local wikilinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-doctor-broken-"));
    await writeFile(join(root, "README.md"), "# Broken\nSee [[missing-note]].\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/broken",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const report = await runDoctor(root);

    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("README.md: [[missing-note]] -> missing local note");
  });

  test("requires each markdown file to contain wikilinks unless frontmatter opts out", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-doctor-file-links-"));
    await writeFile(join(root, "README.md"), "# Linked\nSee [[reference]].\n");
    await writeFile(join(root, "reference.md"), "---\nkpmAllowNoWikilinks: true\n---\n# Reference\n");
    await writeFile(join(root, "orphan.md"), "# Orphan\nNo links.\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/file-links",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md", "./reference": "./reference.md", "./orphan": "./orphan.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const report = await runDoctor(root);

    expect(report.ok).toBe(false);
    expect(report.errors).toContain("orphan.md: file has no wikilinks; add [[...]] or set kpmAllowNoWikilinks: true in frontmatter");
    expect(report.errors).not.toContain("reference.md: file has no wikilinks; add [[...]] or set kpmAllowNoWikilinks: true in frontmatter");
  });

  test("builds a graph for valid packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-doctor-ok-"));
    await mkdir(join(root, "notes"), { recursive: true });
    await writeFile(join(root, "README.md"), "# Valid\nSee [[notes/intro]].\n");
    await writeFile(join(root, "notes", "intro.md"), "# Intro\nSee [[README]].\n");
    await writeJson(join(root, "knowledge.json"), {
      name: "@scope/valid",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md", "./intro": "./notes/intro.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const report = await runDoctor(root);

    expect(report.ok).toBe(true);
    expect(report.graph.edges).toHaveLength(2);
    expect(report.graph.edges[0]).toMatchObject({
      from: "@scope/valid/README.md",
      raw: "[[notes/intro]]",
      resolved: true
    });
  });
});
