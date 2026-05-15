#!/usr/bin/env node
import { buildContext } from "./compiler.js";
import { runDoctor } from "./doctor.js";
import { initProject } from "./init.js";
import { installPackage, removePackage } from "./installer.js";
import { packPackage } from "./pack.js";

type CommandContext = {
  cwd: string;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
};

export async function main(argv = process.argv.slice(2), context: CommandContext = processContext()): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case undefined:
      case "-h":
      case "--help":
        context.stdout.write(helpText());
        return 0;
      case "init":
        await initProject(context.cwd, valueAfter(args, "--name"));
        context.stdout.write("Initialized knowledge package.\n");
        return 0;
      case "add": {
        const source = firstPositional(args);
        if (!source) {
          throw new Error("Usage: kpm add github:owner/repo#ref");
        }
        const installed = await installPackage(context.cwd, source);
        context.stdout.write(`Installed ${installed.manifest.name}@${installed.manifest.version} ${installed.integrity}\n`);
        return 0;
      }
      case "remove": {
        const packageName = firstPositional(args);
        if (!packageName) {
          throw new Error("Usage: kpm remove @scope/package");
        }
        await removePackage(context.cwd, packageName);
        context.stdout.write(`Removed ${packageName}\n`);
        return 0;
      }
      case "doctor": {
        const report = await runDoctor(context.cwd);
        for (const warning of report.warnings) {
          context.stderr.write(`warning: ${warning}\n`);
        }
        if (!report.ok) {
          for (const error of report.errors) {
            context.stderr.write(`error: ${error}\n`);
          }
          return 1;
        }
        context.stdout.write(`Doctor ok: ${report.graph.nodes.length} notes, ${report.graph.edges.length} links.\n`);
        return 0;
      }
      case "build": {
        const result = await buildContext(context.cwd, {
          entries: valuesAfter(args, "--entry"),
          depth: numberAfter(args, "--depth"),
          maxTokens: numberAfter(args, "--max-tokens"),
          target: targetAfter(args),
          outDir: valueAfter(args, "--out-dir") ?? "dist"
        });
        context.stdout.write(
          `Built ${result.files.length} files to ${result.outputPath}${result.skipped.length ? `; skipped ${result.skipped.length}` : ""}.\n`
        );
        return 0;
      }
      case "graph": {
        const report = await runDoctor(context.cwd);
        context.stdout.write(`${JSON.stringify(report.graph, null, 2)}\n`);
        return report.ok ? 0 : 1;
      }
      case "pack": {
        const outputPath = await packPackage(context.cwd, valueAfter(args, "--out-dir") ?? "dist");
        context.stdout.write(`Packed ${outputPath}\n`);
        return 0;
      }
      default:
        throw new Error(`Unknown command "${command}". Run kpm --help.`);
    }
  } catch (error) {
    context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function processContext(): CommandContext {
  return { cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr };
}

function helpText(): string {
  return `kpm - local knowledge package manager

Usage:
  kpm init [--name @scope/project]
  kpm add github:owner/repo#ref
  kpm add file:/absolute/path/to/package
  kpm remove @scope/package
  kpm doctor
  kpm build [--entry README.md] [--depth 3] [--max-tokens 50000] [--target cursor|claude|llms-txt|rag]
  kpm graph
  kpm pack
`;
}

function firstPositional(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith("-"));
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function valuesAfter(args: string[], flag: string): string[] | undefined {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) {
      values.push(args[i + 1]);
      i++;
    }
  }
  return values.length ? values : undefined;
}

function numberAfter(args: string[], flag: string): number | undefined {
  const value = valueAfter(args, flag);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function targetAfter(args: string[]) {
  const target = valueAfter(args, "--target");
  if (!target) {
    return undefined;
  }
  if (target === "cursor" || target === "claude" || target === "llms-txt" || target === "rag") {
    return target;
  }
  throw new Error("--target must be cursor, claude, llms-txt, or rag");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
