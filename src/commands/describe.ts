import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { injectDescription } from "../describe/inject.js";
import { fileExists } from "../files.js";
import { parseKpmConfig } from "../manifest/config.js";
import { parseKnowledgeManifest } from "../manifest/knowledge.js";
import { readLockfile } from "../manifest/lock.js";

export type DescribeOptions = { to: string };

export async function describeProject(projectRoot: string, options: DescribeOptions): Promise<void> {
  const manifest = parseKnowledgeManifest(JSON.parse(await readFile(join(projectRoot, "knowledge.json"), "utf8")));
  const cfg = (await fileExists(join(projectRoot, "kpm.config.json")))
    ? parseKpmConfig(JSON.parse(await readFile(join(projectRoot, "kpm.config.json"), "utf8")))
    : parseKpmConfig({});
  const lock = await readLockfile(projectRoot);

  const lines: string[] = [
    "# Knowledge context (managed by kpm)",
    "",
    `Project: ${manifest.name}@${manifest.version}`,
    `Composed vault: ${cfg.vault}/`,
    "",
    "Installed packages:"
  ];
  const packages = Object.entries(lock.packages);
  if (packages.length === 0) {
    lines.push("- none");
  } else {
    for (const [name, pkg] of packages) {
      lines.push(`- ${name}@${pkg.version} from ${pkg.spec}`);
    }
  }
  lines.push("");
  lines.push(`Agents should treat ${cfg.vault}/ as authoritative reference material. Start at ${cfg.vault}/index.md.`);

  await injectDescription(resolve(projectRoot, options.to), lines.join("\n"));
}
