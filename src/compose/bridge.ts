import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import "./adapters/claude.js";
import "./adapters/codex.js";
import "./adapters/gemini.js";
import { fileExists } from "../files.js";
import { readKpmConfig } from "../manifest/config.js";
import { getAdapter } from "./adapters/base.js";
import { readGeneratedMarker } from "./marker.js";

const BRIDGE_TEMPLATE = `You are bridging multiple knowledge packages composed into the Obsidian-openable vault at "{{vault}}".

Installed packages:
{{packages}}

{{alreadyBridged}}

Your job:
1. Read each package entrypoint and skim its notes.
2. Write "{{vault}}/index.md" with links to every package.
3. Create "{{vault}}/bridges/<slug>.md" files for meaningful conceptual bridges not already listed.

REQUIRED FRONTMATTER on every file you author:
---
kpm-generated: true
kpm-generator: {{generator}}
kpm-generated-at: {{timestamp}}
kpm-sources: [{{sourcesYaml}}]
---

Use only Obsidian-compatible [[wikilinks]]. Never modify package subfolders. Never invent facts. Exit when done.`;

export type BridgeOptions = {
  cli?: string;
  packages: string[];
  runProcess?: (
    command: string,
    args: string[],
    opts: { cwd: string; stdin: string; logPath: string }
  ) => Promise<void>;
};

export type BridgePromptInputs = {
  vault: string;
  packages: string[];
  generator: string;
  timestamp: string;
  alreadyBridged: Array<{ sources: string[]; file: string }>;
};

export function buildBridgePrompt(input: BridgePromptInputs): string {
  const sourcesYaml = input.packages.map((pkg) => JSON.stringify(pkg)).join(", ");
  const alreadyBridged =
    input.alreadyBridged.length === 0
      ? "No bridges have been authored yet."
      : `Already bridged (DO NOT regenerate these):\n${input.alreadyBridged
          .map((bridge) => `- ${bridge.file}: ${bridge.sources.join(" <-> ")}`)
          .join("\n")}`;

  return BRIDGE_TEMPLATE.replace(/\{\{vault\}\}/g, input.vault)
    .replace("{{packages}}", input.packages.map((pkg) => `- ${pkg}`).join("\n"))
    .replace("{{alreadyBridged}}", alreadyBridged)
    .replace("{{generator}}", input.generator)
    .replace("{{timestamp}}", input.timestamp)
    .replace("{{sourcesYaml}}", sourcesYaml);
}

export async function runBridge(projectRoot: string, options: BridgeOptions): Promise<void> {
  const cfg = await readKpmConfig(projectRoot);
  const cliName = options.cli ?? cfg.defaultCli;
  const adapter = getAdapter(cliName);
  const vaultPath = join(projectRoot, cfg.vault);
  await mkdir(vaultPath, { recursive: true });

  const alreadyBridged = await inspectGeneratableTargets(vaultPath);
  const prompt = buildBridgePrompt({
    vault: cfg.vault,
    packages: options.packages,
    generator: cliName,
    timestamp: new Date().toISOString(),
    alreadyBridged
  });

  const ctx = { vault: vaultPath, prompt };
  const stdin = adapter.stdin ? adapter.stdin(ctx) : prompt;
  await mkdir(join(projectRoot, ".kpm", "logs"), { recursive: true });
  const logPath = join(projectRoot, ".kpm", "logs", `compose-${Date.now()}.log`);
  const run = options.runProcess ?? defaultRunProcess;
  await run(adapter.command, adapter.args(ctx), { cwd: vaultPath, stdin, logPath });

  const indexPath = join(vaultPath, "index.md");
  const indexMarker = await readGeneratedMarker(indexPath);
  if (!indexMarker) {
    throw new Error(`bridge failed: adapter exited 0 but ${indexPath} was not created. See ${logPath}.`);
  }
  if (!indexMarker.isGenerated) {
    throw new Error(`bridge failed: ${indexPath} exists but lacks kpm-generated: true frontmatter. See ${logPath}.`);
  }
}

async function inspectGeneratableTargets(vaultPath: string): Promise<Array<{ sources: string[]; file: string }>> {
  const indexPath = join(vaultPath, "index.md");
  const indexMarker = await readGeneratedMarker(indexPath);
  if (indexMarker && !indexMarker.isGenerated) {
    throw new Error(
      `${indexPath} is user-authored (no kpm-generated marker). Rename or delete it to allow kpm to regenerate.`
    );
  }

  const bridgesDir = join(vaultPath, "bridges");
  if (!(await fileExists(bridgesDir))) {
    return [];
  }

  const alreadyBridged: Array<{ sources: string[]; file: string }> = [];
  for (const entry of await readdir(bridgesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const path = join(bridgesDir, entry.name);
    const marker = await readGeneratedMarker(path);
    if (!marker?.isGenerated) {
      throw new Error(
        `${path} is user-authored (no kpm-generated marker). Rename or delete it to allow kpm to regenerate.`
      );
    }
    if (marker.sources.length > 0) {
      alreadyBridged.push({ sources: marker.sources, file: `bridges/${entry.name}` });
    }
  }
  return alreadyBridged;
}

async function defaultRunProcess(
  command: string,
  args: string[],
  opts: { cwd: string; stdin: string; logPath: string }
): Promise<void> {
  const log = createWriteStream(opts.logPath, { flags: "a" });
  await new Promise<void>((resolveDone, rejectDone) => {
    const child = spawn(command, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("error", rejectDone);
    child.on("exit", (code) => {
      log.end();
      if (code === 0) {
        resolveDone();
      } else {
        rejectDone(new Error(`${command} exited with code ${code}. See ${opts.logPath}.`));
      }
    });
    child.stdin.write(opts.stdin);
    child.stdin.end();
  });
}
