import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doctor } from "../../src/commands/doctor.js";

describe("doctor", () => {
  it("reports unresolved cross-package links", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-doctor-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(project, "README.md"), "# R\n\nSee [[@other/pkg/intro]].\n");
    const report = await doctor(project);
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("@other/pkg");
  });

  it("succeeds when there are no broken links", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-doctor-ok-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(project, "README.md"), "# R\n\nSee [[other]].\n");
    await writeFile(join(project, "other.md"), "# Other\n");
    const report = await doctor(project);
    expect(report.ok).toBe(true);
  });

  it("accepts local folder/path wikilinks when the target file exists", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-doctor-path-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({ name: "@me/root", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(project, "README.md"), "See [[notes/other]].\n");
    await mkdir(join(project, "notes"), { recursive: true });
    await writeFile(join(project, "notes", "other.md"), "# Other\n");
    const report = await doctor(project);
    expect(report.ok).toBe(true);
  });

  it("surfaces mutable refs from the lockfile as info", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-doctor-mutable-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({
        name: "@me/root",
        version: "0.1.0",
        type: "knowledge-package",
        knowledgeDependencies: { "@acme/x": "github:acme/x#main" }
      })
    );
    await writeFile(
      join(project, "knowledge.lock"),
      JSON.stringify({
        lockfileVersion: 2,
        packages: {
          "@acme/x": {
            version: "0.0.0",
            spec: "github:acme/x#main",
            resolved: "https://codeload.github.com/acme/x/tar.gz/aaaaaaaa",
            ref: "main",
            refType: "branch",
            commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            integrity: "sha256-aaaa",
            tarballIntegrity: "sha256-bbbb",
            dependencies: {},
            requestedBy: ["@me/root"]
          }
        }
      })
    );
    const report = await doctor(project);
    expect(report.info.join("\n")).toContain("@acme/x");
    expect(report.info.join("\n")).toMatch(/mutable|branch/i);
  });

  it("warns when a transitive dep was overridden by the root", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-doctor-override-"));
    await writeFile(
      join(project, "knowledge.json"),
      JSON.stringify({
        name: "@me/root",
        version: "0.1.0",
        type: "knowledge-package",
        knowledgeDependencies: {
          "@acme/x": "github:acme/x#v0.3.0",
          "@acme/y": "github:acme/y#v0.1.0"
        }
      })
    );
    await writeFile(
      join(project, "knowledge.lock"),
      JSON.stringify({
        lockfileVersion: 2,
        packages: {
          "@acme/x": {
            version: "0.3.0",
            spec: "github:acme/x#v0.3.0",
            resolved: "https://codeload.github.com/acme/x/tar.gz/cccccccc",
            ref: "v0.3.0",
            refType: "tag",
            commit: "cccccccccccccccccccccccccccccccccccccccc",
            integrity: "sha256-cccc",
            tarballIntegrity: "sha256-dddd",
            dependencies: {},
            requestedBy: ["@me/root", "@acme/y"],
            overriddenSpecs: [{ requestedBy: "@acme/y", spec: "github:acme/x#v0.2.0" }]
          },
          "@acme/y": {
            version: "0.1.0",
            spec: "github:acme/y#v0.1.0",
            resolved: "https://codeload.github.com/acme/y/tar.gz/eeeeeeee",
            ref: "v0.1.0",
            refType: "tag",
            commit: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            integrity: "sha256-eeee",
            tarballIntegrity: "sha256-ffff",
            dependencies: { "@acme/x": "github:acme/x#v0.2.0" },
            requestedBy: ["@me/root"]
          }
        }
      })
    );
    const report = await doctor(project);
    const combined = report.warnings.join("\n");
    expect(combined).toContain("@acme/x");
    expect(combined).toContain("@acme/y");
    expect(combined).toContain("v0.2.0");
    expect(combined).toContain("v0.3.0");
  });
});
