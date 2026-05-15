import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { runDoctor } from "./doctor.js";
import { loadManifest } from "./manifest.js";

const execFileAsync = promisify(execFile);

export async function packPackage(packageRoot: string, outDir = "dist"): Promise<string> {
  const report = await runDoctor(packageRoot);
  if (!report.ok) {
    throw new Error(`Cannot pack with doctor errors:\n${report.errors.join("\n")}`);
  }

  const manifest = await loadManifest(packageRoot);
  const safeName = manifest.name.replace(/^@/, "").replace(/\//g, "-");
  const filename = `${safeName}-${manifest.version}.tgz`;
  const outputPath = join(packageRoot, outDir, filename);
  await mkdir(join(packageRoot, outDir), { recursive: true });
  await execFileAsync("tar", [
    "--exclude",
    ".git",
    "--exclude",
    ".kpm",
    "--exclude",
    "knowledge_modules",
    "--exclude",
    "node_modules",
    "--exclude",
    outDir,
    "-czf",
    outputPath,
    "-C",
    packageRoot,
    "."
  ]);
  return outputPath.replace(`${process.cwd()}/`, "") || basename(outputPath);
}
