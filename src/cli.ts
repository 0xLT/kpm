#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { audit } from "./commands/audit.js";
import { compose } from "./commands/compose.js";
import { describeProject } from "./commands/describe.js";
import { doctor } from "./commands/doctor.js";
import { initProject } from "./commands/init.js";
import { installFromLockfile, installNew, removeDependency, updateDependencies } from "./commands/install.js";
import { packPackage } from "./commands/pack.js";

type CommandContext = {
  cwd: string;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
};

export async function main(argv = process.argv.slice(2), ctx: CommandContext = defaults()): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case undefined:
      case "-h":
      case "--help":
        ctx.stdout.write(helpText());
        return 0;
      case "-v":
      case "--version":
        ctx.stdout.write(versionText());
        return 0;
      case "init":
        await initProject(ctx.cwd, valueAfter(args, "--name"));
        ctx.stdout.write("Initialized knowledge package.\n");
        return 0;
      case "add": {
        const source = firstPositional(args);
        if (!source) {
          throw new Error("Usage: kpm add github:owner/repo[#ref|#semver:<range>] | file:/path/to/package");
        }
        await installNew(ctx.cwd, source);
        ctx.stdout.write(`Added ${source}\n`);
        return 0;
      }
      case "install":
        await installFromLockfile(ctx.cwd);
        ctx.stdout.write("Installed from lockfile.\n");
        return 0;
      case "remove": {
        const name = firstPositional(args);
        if (!name) {
          throw new Error("Usage: kpm remove <name>");
        }
        await removeDependency(ctx.cwd, name);
        ctx.stdout.write(`Removed ${name}\n`);
        return 0;
      }
      case "update": {
        const name = firstPositional(args);
        await updateDependencies(ctx.cwd, name);
        ctx.stdout.write(name ? `Updated ${name}\n` : "Updated all dependencies.\n");
        return 0;
      }
      case "compose":
        await compose(ctx.cwd, {
          fresh: args.includes("--fresh"),
          bridge: !args.includes("--no-bridge"),
          cli: valueAfter(args, "--cli")
        });
        ctx.stdout.write("Composed vault.\n");
        return 0;
      case "pack": {
        const outPath = valueAfter(args, "--out");
        const out = await packPackage(ctx.cwd, outPath ? { out: outPath } : {});
        ctx.stdout.write(`Packed ${out}\n`);
        return 0;
      }
      case "doctor": {
        const report = await doctor(ctx.cwd);
        for (const info of report.info) {
          ctx.stdout.write(`info: ${info}\n`);
        }
        for (const warning of report.warnings) {
          ctx.stderr.write(`warning: ${warning}\n`);
        }
        if (!report.ok) {
          for (const error of report.errors) {
            ctx.stderr.write(`error: ${error}\n`);
          }
          return 1;
        }
        ctx.stdout.write("Doctor ok.\n");
        return 0;
      }
      case "audit": {
        const report = await audit(ctx.cwd);
        ctx.stdout.write(`${report.disclaimer}\n`);
        for (const finding of report.findings) {
          ctx.stdout.write(`${finding.severity}: ${finding.packageName} -> ${finding.message}\n`);
        }
        return 0;
      }
      case "describe": {
        const to = valueAfter(args, "--to");
        if (!to) {
          throw new Error("Usage: kpm describe --to AGENTS.md");
        }
        await describeProject(ctx.cwd, { to });
        ctx.stdout.write(`Updated ${to}\n`);
        return 0;
      }
      default:
        throw new Error(`Unknown command "${command}". Run kpm --help.`);
    }
  } catch (error) {
    ctx.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function versionText(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
  return `${pkg.version ?? "0.0.0"}\n`;
}

function helpText(): string {
  return `kpm - npm-style package manager for wiki-linked knowledge bases

Usage:
  kpm init [--name @scope/project]
  kpm add github:owner/repo[#ref|#semver:<range>] | file:/path/to/package
  kpm remove <name>
  kpm install
  kpm update [name]
  kpm compose [--fresh] [--no-bridge] [--cli claude|codex|gemini]
  kpm pack [--out path]
  kpm doctor
  kpm audit
  kpm describe --to AGENTS.md
`;
}

function defaults(): CommandContext {
  return { cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr };
}

function firstPositional(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith("-"));
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

// Detect whether this module was invoked directly. process.argv[1] may be a
// symlink (e.g. the npm-installed `kpm` bin), while import.meta.url is always
// the resolved real path — so resolve argv[1] before comparing, otherwise the
// CLI silently does nothing when run through its bin symlink.
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (invokedDirectly()) {
  process.exitCode = await main();
}
