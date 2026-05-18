import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "../../src/commands/init.js";

describe("kpm init", () => {
  it("writes knowledge.json + kpm.config.json, no README", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-init-"));
    await initProject(dir, "@me/demo");
    const km = JSON.parse(await readFile(join(dir, "knowledge.json"), "utf8"));
    expect(km).toEqual({
      name: "@me/demo",
      version: "0.1.0",
      type: "knowledge-package"
    });
    const cfg = JSON.parse(await readFile(join(dir, "kpm.config.json"), "utf8"));
    expect(cfg).toEqual({ vault: "wiki", defaultCli: "claude", audit: { enabled: false } });
    await expect(readFile(join(dir, "README.md"), "utf8")).rejects.toThrow();
  });

  it("appends kpm entries to an existing .gitignore without overwriting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-init-"));
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    await initProject(dir, "@me/demo");
    const gi = await readFile(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain("node_modules/");
    expect(gi).toContain("knowledge_modules/");
    expect(gi).toContain("wiki/");
    expect(gi).toContain(".kpm/");
  });

  it("creates a .gitignore with kpm entries when none exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-init-"));
    await initProject(dir, "@me/demo");
    const gi = await readFile(join(dir, ".gitignore"), "utf8");
    expect(gi).toMatch(/^knowledge_modules\/$/m);
    expect(gi).toMatch(/^wiki\/$/m);
    expect(gi).toMatch(/^\.kpm\/$/m);
  });

  it("is idempotent: does not duplicate gitignore lines on second init", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-init-"));
    await initProject(dir, "@me/demo");
    await initProject(dir, "@me/demo");
    const gi = await readFile(join(dir, ".gitignore"), "utf8");
    const occurrences = gi.match(/^knowledge_modules\/$/gm)?.length ?? 0;
    expect(occurrences).toBe(1);
  });
});
