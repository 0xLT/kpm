#!/usr/bin/env node
/* global console, process */
import { mkdtemp, cp, rm, readFile, access, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");
const tmpRoot = await mkdtemp(join(tmpdir(), "kpm-examples-"));
const packageCopy = join(tmpRoot, "minimal-package");
const consumer = join(tmpRoot, "consumer");

function run(args, cwd = consumer) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`kpm ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return `${result.stdout}${result.stderr}`;
}

async function expectFile(path) {
  await access(path);
}

try {
  await cp(join(repoRoot, "examples", "minimal-package"), packageCopy, { recursive: true });
  await mkdir(consumer);
  run(["init", "--name", "@demo/consumer"]);

  run(["add", `file:${packageCopy}`]);
  await rm(join(consumer, "knowledge_modules"), { recursive: true, force: true });
  run(["install"]);
  run(["compose", "--no-bridge"]);
  run(["doctor"]);

  await expectFile(join(consumer, "knowledge.lock"));
  await expectFile(join(consumer, "knowledge_modules", "@kpm-examples", "ai-notes", "notes", "overview.md"));
  await expectFile(join(consumer, "wiki", "@kpm-examples", "ai-notes", "notes", "overview.md"));

  const overview = await readFile(join(consumer, "wiki", "@kpm-examples", "ai-notes", "notes", "overview.md"), "utf8");
  if (!overview.includes("[[@kpm-examples/ai-notes/notes/prompt-patterns]]")) {
    throw new Error("compose did not rewrite the bare prompt-patterns wikilink");
  }
  if (!overview.includes("[[@kpm-examples/ai-notes/notes/evaluation]]")) {
    throw new Error("compose did not rewrite the relative evaluation wikilink");
  }

  await writeFile(join(consumer, "AGENTS.md"), "# Demo agent notes\n");
  run(["describe", "--to", "AGENTS.md"]);
  const agents = await readFile(join(consumer, "AGENTS.md"), "utf8");
  if (!agents.includes("@kpm-examples/ai-notes@0.1.0")) {
    throw new Error("describe output did not include the installed example package");
  }

  console.log(`examples smoke ok: ${tmpRoot}`);
} catch (error) {
  await rm(tmpRoot, { recursive: true, force: true });
  throw error;
}
