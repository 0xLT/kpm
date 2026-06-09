import { listInstalledPackageRoots, listPackageFiles } from "./files.js";
import { readKnowledgeManifest } from "./manifest/knowledge.js";
import { createLinkablePackage, type LinkablePackage } from "./markdown/resolve.js";
import type { KnowledgeManifest } from "./types.js";

export type IndexedPackage = LinkablePackage & {
  root: string;
  manifest: KnowledgeManifest;
};

/**
 * Read every package under `knowledge_modules/` into a LinkablePackage. When
 * `onError` is supplied a failed package is reported and skipped (tolerant
 * mode used by `doctor`); otherwise the error propagates.
 */
export async function indexInstalledPackages(
  projectRoot: string,
  onError?: (root: string, error: unknown) => void
): Promise<IndexedPackage[]> {
  const indexed: IndexedPackage[] = [];
  for (const root of await listInstalledPackageRoots(projectRoot)) {
    try {
      const manifest = await readKnowledgeManifest(root);
      const files = await listPackageFiles(root, manifest.files);
      indexed.push({ ...createLinkablePackage(manifest.name, files), root, manifest });
    } catch (error) {
      if (!onError) {
        throw error;
      }
      onError(root, error);
    }
  }
  return indexed;
}
