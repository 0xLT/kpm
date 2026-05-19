import { runRules, type Finding } from "../audit/rules.js";
import { isFileNotFoundError, listInstalledPackageRoots } from "../files.js";
import { readKnowledgeManifest } from "../manifest/knowledge.js";

export type AuditReport = {
  findings: Finding[];
  disclaimer: string;
};

const DISCLAIMER =
  "BETA: kpm audit is advisory only and may produce false positives/negatives. Do not rely on this as a security boundary.";

export async function audit(projectRoot: string): Promise<AuditReport> {
  const findings: Finding[] = [];
  for (const root of await listInstalledPackageRoots(projectRoot)) {
    await auditOne(root, findings);
  }

  return { findings, disclaimer: DISCLAIMER };
}

async function auditOne(root: string, findings: Finding[]): Promise<void> {
  const manifest = await readKnowledgeManifest(root).catch((error: unknown) => {
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  });
  if (!manifest) {
    return;
  }
  findings.push(...(await runRules(root, manifest.name)));
}
