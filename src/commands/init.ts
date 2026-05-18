import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileExists, writeJsonFile } from "../files.js";

const GITIGNORE_ENTRIES = ["knowledge_modules/", "wiki/", ".kpm/"];

export async function initProject(root: string, name?: string): Promise<void> {
  const packageName = normalizeName(name ?? basename(root) ?? "knowledge-project");
  if (!(await fileExists(join(root, "knowledge.json")))) {
    await writeJsonFile(join(root, "knowledge.json"), {
      name: packageName,
      version: "0.1.0",
      type: "knowledge-package"
    });
  }

  if (!(await fileExists(join(root, "kpm.config.json")))) {
    await writeJsonFile(join(root, "kpm.config.json"), {
      vault: "wiki",
      defaultCli: "claude",
      audit: { enabled: false }
    });
  }

  await mergeGitignore(root);
}

async function mergeGitignore(root: string): Promise<void> {
  const path = join(root, ".gitignore");
  const existing = (await fileExists(path)) ? await readFile(path, "utf8") : "";
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const additions = GITIGNORE_ENTRIES.filter((entry) => !existingLines.has(entry));
  if (additions.length === 0) {
    return;
  }
  const prefix = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  const heading = existing.length > 0 ? "# kpm\n" : "";
  await writeFile(path, `${existing}${prefix}${heading}${additions.join("\n")}\n`);
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^@a-z0-9._/-]/g, "-")
    .replace(/^-+|-+$/g, "");
}
