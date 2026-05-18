import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compose } from "../../src/commands/compose.js";
import { installNew } from "../../src/commands/install.js";

const fixture = (name: string) => resolve(new URL(`../fixtures/${name}`, import.meta.url).pathname);

describe("kpm compose", () => {
  it("copies installed packages into the vault and skips the LLM step when bridge is disabled", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-cmd-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" }, null, 2)
    );
    await writeFile(join(project, "kpm.config.json"), JSON.stringify({ vault: "wiki", defaultCli: "claude" }));
    await installNew(project, `file:${fixture("file-pkg-b")}`);
    await compose(project, { bridge: false, log: () => {} });
    const readme = await readFile(join(project, "wiki", "@fix", "b", "README.md"), "utf8");
    expect(readme).toContain("# B");
  });

  it("fresh wipes the vault before re-copying", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-compose-fresh-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(project, "kpm.config.json"), JSON.stringify({ vault: "wiki", defaultCli: "claude" }));
    await installNew(project, `file:${fixture("file-pkg-b")}`);
    await compose(project, { bridge: false, log: () => {} });
    await writeFile(join(project, "wiki", "stray.md"), "stray");
    await compose(project, { bridge: false, fresh: true, log: () => {} });
    await expect(stat(join(project, "wiki", "stray.md"))).rejects.toBeTruthy();
  });
});
