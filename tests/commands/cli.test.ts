import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli.js";

const pkgVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string })
  .version;

const execFileAsync = promisify(execFile);

function captureStdio() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: { write: (chunk: string) => (out.push(chunk), true) },
    stderr: { write: (chunk: string) => (err.push(chunk), true) }
  };
}

describe("cli", () => {
  it("--help prints all 8 v2 verbs", async () => {
    const io = captureStdio();
    const code = await main(["--help"], { cwd: process.cwd(), stdout: io.stdout, stderr: io.stderr });
    expect(code).toBe(0);
    const text = io.out.join("");
    for (const verb of ["init", "add", "install", "compose", "pack", "doctor", "audit", "describe"]) {
      expect(text).toContain(verb);
    }
  });

  it("runs when invoked through an installed bin symlink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-bin-"));
    const bin = join(dir, "kpm");
    const cli = resolve("dist/cli.js");

    await symlink(cli, bin);

    const { stdout } = await execFileAsync(bin, ["--help"], { cwd: dir });

    expect(stdout).toContain("kpm - npm-style package manager");
    expect(stdout).toContain("Usage:");
  });

  it("--version and -v print the package version", async () => {
    for (const flag of ["--version", "-v"]) {
      const io = captureStdio();
      const code = await main([flag], { cwd: process.cwd(), stdout: io.stdout, stderr: io.stderr });
      expect(code).toBe(0);
      expect(io.out.join("").trim()).toBe(pkgVersion);
    }
  });

  it("add in an uninitialized directory fails with guidance to run kpm init", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-noinit-"));
    const io = captureStdio();
    const code = await main(["add", "file:/tmp/whatever"], { cwd: dir, stdout: io.stdout, stderr: io.stderr });
    expect(code).toBe(1);
    expect(io.err.join("")).toContain("kpm init");
  });

  it("init creates a project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-cli-"));
    const io = captureStdio();
    const code = await main(["init", "--name", "@me/x"], { cwd: dir, stdout: io.stdout, stderr: io.stderr });
    expect(code).toBe(0);
  });

  it("passes pack --out as a PackOptions object", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kpm-cli-pack-"));
    await writeFile(
      join(dir, "knowledge.json"),
      JSON.stringify({ name: "@me/x", version: "0.1.0", type: "knowledge-package" })
    );
    await writeFile(join(dir, "README.md"), "# X\n");
    const io = captureStdio();
    const out = join(dir, "artifacts", "x.tgz");
    const code = await main(["pack", "--out", out], { cwd: dir, stdout: io.stdout, stderr: io.stderr });
    expect(code).toBe(0);
    await expect(stat(out)).resolves.toBeDefined();
  });
});
