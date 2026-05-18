import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { injectDescription } from "../../src/describe/inject.js";

describe("injectDescription", () => {
  it("creates the file if it does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-desc-"));
    const dest = join(dir, "AGENTS.md");
    await injectDescription(dest, "Hello world.");
    const out = await readFile(dest, "utf8");
    expect(out).toContain("<!-- BEGIN KPM-CONTEXT -->");
    expect(out).toContain("Hello world.");
    expect(out).toContain("<!-- END KPM-CONTEXT -->");
  });

  it("updates only the block on rerun", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-desc-rerun-"));
    const dest = join(dir, "CLAUDE.md");
    await writeFile(dest, "Existing top.\n\nExisting bottom.\n");
    await injectDescription(dest, "First.");
    await injectDescription(dest, "Second.");
    const out = await readFile(dest, "utf8");
    expect(out).toContain("Existing top.");
    expect(out).toContain("Existing bottom.");
    expect(out).toContain("Second.");
    expect(out).not.toContain("First.");
    expect(out.match(/BEGIN KPM-CONTEXT/g)?.length).toBe(1);
  });
});
