import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { installFromLockfile, installNew } from "../../src/commands/install.js";

const fixture = (name: string) => resolve(new URL(`../fixtures/${name}`, import.meta.url).pathname);

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kpm-install-"));
  await writeFile(
    join(dir, "knowledge.json"),
    JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" }, null, 2)
  );
  return dir;
}

describe("kpm install / add", () => {
  it("hydrates knowledge_modules from a file: dep", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-b");
    await installNew(project, `file:${dep}`);
    const installed = await readdir(join(project, "knowledge_modules", "@fix"));
    expect(installed).toContain("b");
    const lock = JSON.parse(await readFile(join(project, "knowledge.lock"), "utf8"));
    expect(lock.packages["@fix/b"]).toBeDefined();
  });

  it("hydrates transitively when a dep declares its own deps", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-a");
    await installNew(project, `file:${dep}`);
    const a = await readdir(join(project, "knowledge_modules", "@fix", "a"));
    const b = await readdir(join(project, "knowledge_modules", "@fix", "b"));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it("installFromLockfile keeps the lockfile stable when packages already match", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-b");
    await installNew(project, `file:${dep}`);
    const before = await readFile(join(project, "knowledge.lock"), "utf8");
    await installFromLockfile(project);
    const after = await readFile(join(project, "knowledge.lock"), "utf8");
    expect(after).toBe(before);
  });

  it("installFromLockfile hydrates from knowledge.lock instead of re-resolving knowledge.json", async () => {
    const project = await makeProject();
    const dep = fixture("file-pkg-b");
    const depAlt = fixture("file-pkg-b-alt");
    await installNew(project, `file:${dep}`);
    const locked = await readFile(join(project, "knowledge.lock"), "utf8");

    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({
        name: "@me/root",
        version: "0.1.0",
        type: "knowledge-package",
        knowledgeDependencies: { "@fix/b": `file:${depAlt}` }
      })
    );
    await rm(join(project, "knowledge_modules"), { recursive: true, force: true });

    await installFromLockfile(project);
    const installedManifest = JSON.parse(
      await readFile(join(project, "knowledge_modules", "@fix", "b", "knowledge.json"), "utf8")
    );
    expect(installedManifest.version).toBe("0.1.0");
    const after = await readFile(join(project, "knowledge.lock"), "utf8");
    expect(after).toBe(locked);
  });
});
