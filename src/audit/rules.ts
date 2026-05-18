import { stat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export type Finding = {
  severity: "info" | "warn";
  packageName: string;
  message: string;
};

const ALLOWED_EXT = new Set([".md", ".json", ".txt", ".yml", ".yaml"]);

export async function runRules(pkgRoot: string, packageName: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const ext = (entry.name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        findings.push({
          severity: "warn",
          packageName,
          message: `unexpected file extension "${ext}" at ${relative(pkgRoot, abs)}`
        });
      } else {
        const size = (await stat(abs)).size;
        if (size > 1_000_000) {
          findings.push({
            severity: "warn",
            packageName,
            message: `${relative(pkgRoot, abs)} is ${(size / 1_000_000).toFixed(2)} MB`
          });
        }
      }
    }
  }

  await walk(pkgRoot);
  return findings;
}
