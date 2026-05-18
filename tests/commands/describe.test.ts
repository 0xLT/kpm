import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeProject } from "../../src/commands/describe.js";

describe("kpm describe", () => {
  it("writes a marker-wrapped block to the chosen file", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-describe-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(project, "kpm.config.json"), JSON.stringify({ vault: "wiki", defaultCli: "claude" }));
    await writeFile(
      join(project, "knowledge.lock"),
      JSON.stringify({
        lockfileVersion: 2,
        root: { name: "@me/root", version: "0.1.0" },
        packages: {
          "@x/y": {
            version: "1.0.0",
            spec: "github:x/y#v1.0.0",
            resolved: "",
            ref: "v1.0.0",
            refType: "tag",
            commit: "",
            integrity: "",
            tarballIntegrity: "",
            dependencies: {},
            requestedBy: ["root"]
          }
        }
      })
    );
    await describeProject(project, { to: "AGENTS.md" });
    const out = await readFile(join(project, "AGENTS.md"), "utf8");
    expect(out).toContain("BEGIN KPM-CONTEXT");
    expect(out).toContain("@x/y");
    expect(out).toContain("wiki/");
  });
});
