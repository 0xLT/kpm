import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { runRules, type Finding } from "../audit/rules.js";
import { fileExists } from "../files.js";
import { parseKnowledgeManifest } from "../manifest/knowledge.js";

export type AuditReport = {
  findings: Finding[];
  disclaimer: string;
};

const DISCLAIMER =
  "BETA: kpm audit is advisory only and may produce false positives/negatives. Do not rely on this as a security boundary.";

export async function audit(projectRoot: string): Promise<AuditReport> {
  const findings: Finding[] = [];
  const modules = join(projectRoot, "knowledge_modules");
  if (!(await fileExists(modules))) {
    return { findings, disclaimer: DISCLAIMER };
  }

  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scoped of await readdir(join(modules, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          await auditOne(join(modules, entry.name, scoped.name), findings);
        }
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      await auditOne(join(modules, entry.name), findings);
    }
  }

  return { findings, disclaimer: DISCLAIMER };
}

async function auditOne(root: string, findings: Finding[]): Promise<void> {
  const manifestPath = join(root, "knowledge.json");
  if (!(await fileExists(manifestPath))) {
    return;
  }
  const manifest = parseKnowledgeManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  findings.push(...(await runRules(root, manifest.name)));
}
