import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileExists, listPackageFiles } from "../files.js";
import { parseKpmConfig } from "../manifest/config.js";
import { parseKnowledgeManifest } from "../manifest/knowledge.js";
import { parseNote } from "../markdown/parse.js";
import { withoutMarkdownExtension } from "../paths.js";

export type DoctorReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
};

export async function doctor(projectRoot: string): Promise<DoctorReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const manifest = parseKnowledgeManifest(JSON.parse(await readFile(join(projectRoot, "knowledge.json"), "utf8")));
  const cfg = (await fileExists(join(projectRoot, "kpm.config.json")))
    ? parseKpmConfig(JSON.parse(await readFile(join(projectRoot, "kpm.config.json"), "utf8")))
    : parseKpmConfig({});
  const files = await listPackageFiles(projectRoot, manifest.files, { excludes: [`${cfg.vault}/**`] });
  const localTargets = new Set<string>();

  for (const file of files.filter((entry) => entry.toLowerCase().endsWith(".md"))) {
    const target = withoutMarkdownExtension(file);
    localTargets.add(target);
    localTargets.add(basename(target));
  }

  for (const file of files.filter((entry) => entry.toLowerCase().endsWith(".md"))) {
    const note = parseNote(file, await readFile(join(projectRoot, file), "utf8"));
    for (const link of note.wikilinks) {
      if (link.packageName) {
        continue;
      }
      const target = withoutMarkdownExtension(link.target);
      if (!localTargets.has(target)) {
        errors.push(`${file}: ${link.raw} -> missing local note ${link.target}`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, info };
}
