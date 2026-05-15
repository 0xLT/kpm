import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, writeJsonFile } from "./files.js";

export async function initProject(root: string, name?: string): Promise<void> {
  const packageName = normalizeName(name ?? root.split(/[\\/]/).filter(Boolean).pop() ?? "knowledge-project");
  const manifestPath = join(root, "knowledge.json");
  if (!(await fileExists(manifestPath))) {
    await writeJsonFile(manifestPath, {
      name: packageName,
      version: "0.1.0",
      description: "Local knowledge package",
      type: "knowledge-package",
      exports: {
        ".": "./README.md",
        "./index": "./index.md"
      },
      context: {
        entrypoints: ["README.md"],
        include: ["**/*.md"],
        exclude: ["drafts/**", "private/**"],
        tags: [],
        audience: ["llm", "developer", "agent"],
        requireWikilinks: true
      },
      wikilinks: {
        caseSensitive: false,
        extensions: [".md"],
        ambiguous: "error"
      },
      knowledgeDependencies: {}
    });
  }
  if (!(await fileExists(join(root, "README.md")))) {
    await writeFile(join(root, "README.md"), `# ${packageName}\n\nStart at [[index]].\n`);
  }
  if (!(await fileExists(join(root, "index.md")))) {
    await writeFile(join(root, "index.md"), "# Index\n\nReturn to [[README]].\n");
  }
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^@a-z0-9._/-]/g, "-")
    .replace(/^-+|-+$/g, "");
}
