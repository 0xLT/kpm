import { readFile } from "node:fs/promises";
import { fileExists } from "../files.js";
import { parseNote } from "../markdown/parse.js";

export type GeneratedMarker = {
  isGenerated: boolean;
  sources: string[];
};

export async function readGeneratedMarker(filePath: string): Promise<GeneratedMarker | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const note = parseNote(filePath, await readFile(filePath, "utf8"));
  const sources = note.frontmatter["kpm-sources"];
  return {
    isGenerated: note.frontmatter["kpm-generated"] === true,
    sources: Array.isArray(sources) ? sources.filter((value): value is string => typeof value === "string") : []
  };
}
