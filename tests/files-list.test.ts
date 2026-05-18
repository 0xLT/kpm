import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listPackageFiles } from "../src/files.js";

describe("listPackageFiles", () => {
  it("matches glob includes and excludes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-glob-"));
    await mkdir(join(dir, "src"), { recursive: true });
    await mkdir(join(dir, "drafts"), { recursive: true });
    await writeFile(join(dir, "README.md"), "x");
    await writeFile(join(dir, "src", "a.md"), "x");
    await writeFile(join(dir, "drafts", "wip.md"), "x");
    const files = await listPackageFiles(dir, ["**/*.md", "!drafts/**"]);
    expect(files.sort()).toEqual(["README.md", "src/a.md"]);
  });

  it("excludes generated vault output and internal kpm folders when requested by callers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-glob-"));
    await mkdir(join(dir, "wiki", "@fix", "b"), { recursive: true });
    await mkdir(join(dir, "knowledge_modules", "@fix", "b"), { recursive: true });
    await mkdir(join(dir, ".kpm", "pack"), { recursive: true });
    await writeFile(join(dir, "README.md"), "root");
    await writeFile(join(dir, "wiki", "@fix", "b", "README.md"), "generated");
    await writeFile(join(dir, "knowledge_modules", "@fix", "b", "README.md"), "installed");
    await writeFile(join(dir, ".kpm", "pack", "README.md"), "internal");
    const files = await listPackageFiles(dir, ["**/*.md"], { excludes: ["wiki/**"] });
    expect(files).toEqual(["README.md"]);
  });
});
