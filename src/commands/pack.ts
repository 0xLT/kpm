import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { c as tarCreate } from "tar";
import { listPackageFiles } from "../files.js";
import { readKpmConfig } from "../manifest/config.js";
import { readProjectManifest } from "../manifest/knowledge.js";
import { parsePackageSource } from "../resolver/sources.js";
import { doctor } from "./doctor.js";

export type PackOptions = { out?: string };

export async function packPackage(packageRoot: string, options: PackOptions = {}): Promise<string> {
  const manifest = await readProjectManifest(packageRoot);
  const cfg = await readKpmConfig(packageRoot);

  for (const [depName, spec] of Object.entries(manifest.knowledgeDependencies)) {
    const source = parsePackageSource(spec);
    if (source.refType === "branch") {
      throw new Error(
        `cannot pack ${manifest.name}: dependency ${depName} uses mutable ref "${spec}". Pin to a tag or commit SHA before packing.`
      );
    }
  }

  const report = await doctor(packageRoot);
  if (!report.ok) {
    throw new Error(`doctor failed; refusing to pack:\n  - ${report.errors.join("\n  - ")}`);
  }

  const files = await listPackageFiles(packageRoot, [...manifest.files, "knowledge.json"], {
    excludes: [`${cfg.vault}/**`]
  });
  if (!files.includes(manifest.entrypoint)) {
    throw new Error(`entrypoint "${manifest.entrypoint}" not included in files globs`);
  }

  const safeName = manifest.name.replace(/^@/, "").replace(/\//g, "-");
  const filename = `${safeName}-${manifest.version}.tgz`;
  const outputPath = options.out ?? join(packageRoot, ".kpm", "pack", filename);
  await mkdir(dirname(outputPath), { recursive: true });
  await tarCreate({ gzip: true, file: outputPath, cwd: packageRoot, portable: true }, files);
  return outputPath;
}
