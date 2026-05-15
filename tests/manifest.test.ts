import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { validateManifest } from "../src/manifest.js";

describe("manifest validation", () => {
  test("accepts a minimal knowledge package manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-manifest-ok-"));
    await writeFile(join(root, "README.md"), "# Package\nSee [[notes/intro]].\n");
    await writeFile(join(root, "intro.md"), "# Intro\nSee [[README]].\n");

    const result = await validateManifest(
      {
        name: "@scope/demo",
        version: "0.1.0",
        type: "knowledge-package",
        exports: {
          ".": "./README.md"
        },
        context: {
          entrypoints: ["README.md"],
          include: ["**/*.md"],
          exclude: ["private/**"],
          requireWikilinks: true
        }
      },
      { packageRoot: root }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.context.requireWikilinks).toBe(true);
      expect(result.manifest.wikilinks.ambiguous).toBe("error");
    }
  });

  test("rejects path traversal and missing exported files", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-manifest-bad-"));
    const result = await validateManifest(
      {
        name: "@scope/demo",
        version: "0.1.0",
        type: "knowledge-package",
        exports: {
          ".": "../secret.md",
          "./missing": "./missing.md"
        },
        context: {
          entrypoints: ["README.md"],
          include: ["**/*.md"]
        }
      },
      { packageRoot: root }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("exports[.] must stay inside the package");
      expect(result.errors.join("\n")).toContain("exports[./missing] points to missing file");
    }
  });
});
