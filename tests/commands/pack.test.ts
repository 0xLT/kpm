import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packPackage } from "../../src/commands/pack.js";

describe("kpm pack", () => {
  it("creates a tgz at .kpm/pack/<scope>-<name>-<version>.tgz by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-pack-"));
    await writeFile(
      join(dir, "knowledge.json"),
      JSON.stringify({ name: "@me/x", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(dir, "README.md"), "# X\n");
    const out = await packPackage(dir);
    const entries = await readdir(join(dir, ".kpm", "pack"));
    expect(entries).toContain("me-x-0.1.0.tgz");
    expect(out).toContain(join(".kpm", "pack", "me-x-0.1.0.tgz"));
  });

  it("respects --out override", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-pack-"));
    await writeFile(
      join(dir, "knowledge.json"),
      JSON.stringify({ name: "@me/x", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(dir, "README.md"), "# X\n");
    const explicit = join(dir, "artifacts", "x.tgz");
    const out = await packPackage(dir, { out: explicit });
    expect(out).toBe(explicit);
  });

  it("hard-errors when knowledgeDependencies contains a mutable branch ref", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-pack-"));
    await writeFile(
      join(dir, "knowledge.json"),
      JSON.stringify({
        name: "@me/x",
        version: "0.1.0",
        type: "knowledge-package",
        knowledgeDependencies: { "@acme/a": "github:acme/a#main" }
      })
    );
    await writeFile(join(dir, "README.md"), "# X\n");
    await expect(packPackage(dir)).rejects.toThrow(/mutable ref/i);
  });

  it("hard-errors when doctor reports unresolved wikilinks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-pack-"));
    await writeFile(
      join(dir, "knowledge.json"),
      JSON.stringify({ name: "@me/x", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(dir, "README.md"), "See [[missing-note]].\n");
    await expect(packPackage(dir)).rejects.toThrow(/doctor failed/i);
  });
});
