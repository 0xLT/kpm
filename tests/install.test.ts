import { lstat, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { installPackage } from "../src/installer.js";
import { parsePackageSource } from "../src/sources.js";

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2));
}

describe("package installation", () => {
  test("parses GitHub package specs into public tarball URLs", () => {
    expect(parsePackageSource("github:acme/react-context#v0.1.0")).toEqual({
      kind: "github",
      owner: "acme",
      repo: "react-context",
      ref: "v0.1.0",
      original: "github:acme/react-context#v0.1.0",
      tarballUrl: "https://api.github.com/repos/acme/react-context/tarball/v0.1.0"
    });
  });

  test("installs a local package source into the content-addressed store and lockfile", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-install-project-"));
    const source = await mkdtemp(join(tmpdir(), "kpm-install-source-"));
    await mkdir(join(project, "context"), { recursive: true });
    await writeFile(join(project, "README.md"), "# Project\nSee [[@scope/pkg]].\n");
    await writeJson(join(project, "knowledge.json"), {
      name: "@scope/project",
      version: "0.1.0",
      type: "knowledge-package",
      exports: { ".": "./README.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });
    await writeFile(join(source, "README.md"), "# Package\nSee [[README]].\n");
    await writeJson(join(source, "knowledge.json"), {
      name: "@scope/pkg",
      version: "0.2.0",
      type: "knowledge-package",
      exports: { ".": "./README.md" },
      context: { entrypoints: ["README.md"], include: ["**/*.md"], requireWikilinks: true }
    });

    const installed = await installPackage(project, `file:${source}`);

    expect(installed.manifest.name).toBe("@scope/pkg");
    expect(installed.integrity).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect((await lstat(join(project, "knowledge_modules", "@scope", "pkg"))).isSymbolicLink()).toBe(true);

    const projectManifest = JSON.parse(await readFile(join(project, "knowledge.json"), "utf8"));
    expect(projectManifest.knowledgeDependencies["@scope/pkg"]).toBe(`file:${source}`);

    const lock = JSON.parse(await readFile(join(project, "knowledge.lock"), "utf8"));
    expect(lock.packages["@scope/pkg"].version).toBe("0.2.0");
    expect(lock.packages["@scope/pkg"].source).toBe(`file:${source}`);
  });
});
