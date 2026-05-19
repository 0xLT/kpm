import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyAndRewrite } from "../../src/compose/copy.js";

describe("compose copyAndRewrite", () => {
  async function setupAB(project: string) {
    const a = join(project, "knowledge_modules", "@fix", "a");
    await mkdir(a, { recursive: true });
    await writeFile(join(a, "knowledge.json"), JSON.stringify({ name: "@fix/a", version: "0.1.0", type: "knowledge-package" }));
    const b = join(project, "knowledge_modules", "@fix", "b");
    await mkdir(b, { recursive: true });
    await writeFile(join(b, "knowledge.json"), JSON.stringify({ name: "@fix/b", version: "0.1.0", type: "knowledge-package" }));
    return { a, b };
  }

  it("rewrites explicit cross-pkg, intra-pkg bare-name, folder path, and ./ relative", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-"));
    const { a, b } = await setupAB(project);
    await writeFile(join(a, "README.md"), "See [[intro]], [[sub/deep]], [[./sub/deep]], and [[@fix/b/start]].\n");
    await writeFile(join(a, "intro.md"), "# Intro\n");
    await mkdir(join(a, "sub"), { recursive: true });
    await writeFile(join(a, "sub", "deep.md"), "# Deep\n");
    await writeFile(join(b, "start.md"), "# Start\n");

    await copyAndRewrite(project, "wiki");
    const out = await readFile(join(project, "wiki", "@fix", "a", "README.md"), "utf8");
    expect(out).toContain("[[@fix/a/intro]]");
    expect(out).toContain("[[@fix/a/sub/deep]]");
    expect(out).toContain("[[@fix/b/start]]");
  });

  it("hard-errors when a bare name has no match inside the source package", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-bare-miss-"));
    const { a } = await setupAB(project);
    await writeFile(join(a, "README.md"), "See [[ghost]].\n");
    await expect(copyAndRewrite(project, "wiki")).rejects.toThrow(/no file matches "ghost"/);
  });

  it("hard-errors on ambiguous bare names within a single package", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-bare-amb-"));
    const { a } = await setupAB(project);
    await mkdir(join(a, "x"), { recursive: true });
    await mkdir(join(a, "y"), { recursive: true });
    await writeFile(join(a, "x", "intro.md"), "# X intro\n");
    await writeFile(join(a, "y", "intro.md"), "# Y intro\n");
    await writeFile(join(a, "README.md"), "See [[intro]].\n");
    await expect(copyAndRewrite(project, "wiki")).rejects.toThrow(/ambiguous/);
  });

  it("never falls back to cross-package for bare names", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-no-cross-"));
    const { a, b } = await setupAB(project);
    await writeFile(join(b, "lonely.md"), "# Lonely\n");
    await writeFile(join(a, "README.md"), "See [[lonely]].\n");
    await expect(copyAndRewrite(project, "wiki")).rejects.toThrow(/no file matches "lonely"/);
  });

  it("hard-errors when an explicit cross-pkg target points at an uninstalled package", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-missing-pkg-"));
    const { a } = await setupAB(project);
    await writeFile(join(a, "README.md"), "See [[@nobody/here/x]].\n");
    await expect(copyAndRewrite(project, "wiki")).rejects.toThrow(/@nobody\/here.*not installed/);
  });

  it("prunes vault subfolders for packages no longer installed", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-prune-"));
    const { a } = await setupAB(project);
    await writeFile(join(a, "README.md"), "# A\n");
    const stale = join(project, "wiki", "@old", "gone");
    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, "README.md"), "stale");
    await copyAndRewrite(project, "wiki");
    await expect(stat(join(project, "wiki", "@old", "gone"))).rejects.toBeTruthy();
  });

  it("clears a package output directory before incremental recopy", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-clear-"));
    const { a } = await setupAB(project);
    await writeFile(join(a, "README.md"), "# A\n");
    await copyAndRewrite(project, "wiki");
    await writeFile(join(project, "wiki", "@fix", "a", "stale.md"), "stale");
    await copyAndRewrite(project, "wiki");
    await expect(stat(join(project, "wiki", "@fix", "a", "stale.md"))).rejects.toBeTruthy();
  });
});
