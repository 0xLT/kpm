import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { main } from "../src/cli.js";

class MemoryStream {
  chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(String(chunk));
    return true;
  }

  toString(): string {
    return this.chunks.join("");
  }
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2));
}

describe("cli", () => {
  test("initializes a valid package and builds it", async () => {
    const root = await mkdtemp(join(tmpdir(), "kpm-cli-init-"));
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    expect(await main(["init", "--name", "@scope/cli"], { cwd: root, stdout, stderr })).toBe(0);
    expect(await main(["doctor"], { cwd: root, stdout, stderr })).toBe(0);
    expect(await main(["build", "--entry", "README.md", "--max-tokens", "1000"], { cwd: root, stdout, stderr })).toBe(0);

    expect(await readFile(join(root, "dist", "context.md"), "utf8")).toContain("@scope/cli Context");
    expect(stderr.toString()).toBe("");
  });

  test("adds a local package through the CLI and records it in the lockfile", async () => {
    const project = await mkdtemp(join(tmpdir(), "kpm-cli-project-"));
    const source = await mkdtemp(join(tmpdir(), "kpm-cli-source-"));
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

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

    expect(await main(["add", `file:${source}`], { cwd: project, stdout, stderr })).toBe(0);

    const lock = JSON.parse(await readFile(join(project, "knowledge.lock"), "utf8"));
    expect(lock.packages["@scope/pkg"].version).toBe("0.2.0");
    expect(stdout.toString()).toContain("Installed @scope/pkg@0.2.0");
    expect(stderr.toString()).toBe("");
  });
});
